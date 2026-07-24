<?php

use App\Enums\DeliveryStatus;
use App\Enums\TransactionType;
use App\Models\ShopItem;
use App\Models\ShopPurchase;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WhitelistEntry;
use App\Services\DeliveryQueueManager;
use App\Services\OnlinePlayersReader;
use App\Services\ShopDeliveryService;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Covers the deliver-then-debit atomicity guarantees:
 * pending holds prevent double-spending, wallets are only debited after
 * confirmed delivery, and delivered items roll back if the debit fails.
 */
beforeEach(function () {
    $this->withoutVite();
    $this->user = User::factory()->create();
    $this->user->whitelistEntries()->save(
        WhitelistEntry::factory()->make(['pz_username' => 'testplayer', 'active' => true])
    );
    $this->wallet = Wallet::factory()->for($this->user)->create(['balance' => 1000, 'total_earned' => 1000, 'total_spent' => 0]);

    $onlineMock = Mockery::mock(OnlinePlayersReader::class);
    $onlineMock->shouldReceive('getOnlineUsernames')->andReturn(['testplayer']);
    $this->app->instance(OnlinePlayersReader::class, $onlineMock);
});

function mockOfflineDeliveryQueue(): Mockery\MockInterface
{
    // Player offline: RCON give fails, entries queue to Lua for later delivery
    $mock = Mockery::mock(DeliveryQueueManager::class);
    $mock->shouldReceive('giveItem')->andReturnUsing(fn (string $u, string $t, int $c) => [
        'id' => 'queue-'.uniqid(),
        'status' => 'queued',
    ]);
    app()->instance(DeliveryQueueManager::class, $mock);

    return $mock;
}

// ── Pending holds (double-spend prevention) ─────────────────────────

it('subtracts pending purchase holds from available balance', function () {
    ShopPurchase::factory()->for($this->user)->create([
        'wallet_transaction_id' => null,
        'delivery_status' => DeliveryStatus::Queued,
        'total_price' => 400,
    ]);

    $walletService = app(WalletService::class);

    expect($walletService->getBalance($this->user))->toBe(1000.0)
        ->and($walletService->getAvailableBalance($this->user))->toBe(600.0);
});

it('does not hold balance for failed or already-debited purchases', function () {
    ShopPurchase::factory()->for($this->user)->create([
        'wallet_transaction_id' => null,
        'delivery_status' => DeliveryStatus::Failed,
        'total_price' => 300,
    ]);

    $transaction = WalletTransaction::factory()->for($this->wallet)->create();
    ShopPurchase::factory()->for($this->user)->create([
        'wallet_transaction_id' => $transaction->id,
        'delivery_status' => DeliveryStatus::Delivered,
        'total_price' => 300,
    ]);

    expect(app(WalletService::class)->getAvailableBalance($this->user))->toBe(1000.0);
});

it('rejects a purchase that exceeds available balance due to a pending hold', function () {
    mockOfflineDeliveryQueue();

    ShopPurchase::factory()->for($this->user)->create([
        'wallet_transaction_id' => null,
        'delivery_status' => DeliveryStatus::Queued,
        'total_price' => 400,
    ]);

    // Actual balance 1000 covers the price — only the hold makes it insufficient
    $item = ShopItem::factory()->create(['price' => 700]);

    $this->actingAs($this->user)
        ->postJson("/shop/{$item->slug}/purchase")
        ->assertStatus(422);

    expect(ShopPurchase::query()->where('purchasable_id', $item->id)->exists())->toBeFalse();
});

// ── Deliver-then-debit lifecycle ────────────────────────────────────

it('queues an offline purchase without debiting the wallet', function () {
    mockOfflineDeliveryQueue();

    $item = ShopItem::factory()->create(['price' => 250]);

    $this->actingAs($this->user)
        ->postJson("/shop/{$item->slug}/purchase")
        ->assertOk();

    $purchase = ShopPurchase::query()->where('purchasable_id', $item->id)->first();

    expect($purchase->delivery_status)->toBe(DeliveryStatus::Queued)
        ->and($purchase->wallet_transaction_id)->toBeNull()
        ->and((float) $this->wallet->fresh()->balance)->toBe(1000.0)
        ->and(app(WalletService::class)->getAvailableBalance($this->user))->toBe(750.0);
});

it('debits the wallet and links the transaction once delivery is confirmed', function () {
    $mock = mockOfflineDeliveryQueue();

    $item = ShopItem::factory()->create(['price' => 250]);

    $this->actingAs($this->user)
        ->postJson("/shop/{$item->slug}/purchase")
        ->assertOk();

    $purchase = ShopPurchase::query()->where('purchasable_id', $item->id)->first();
    $queueId = $purchase->deliveries->first()->delivery_queue_id;

    // Lua reports the queued item was handed over in-game
    $mock->shouldReceive('readResults')->andReturn(['results' => [
        ['id' => $queueId, 'status' => 'delivered'],
    ]]);

    app(ShopDeliveryService::class)->processResults();

    $purchase->refresh();

    expect($purchase->delivery_status)->toBe(DeliveryStatus::Delivered)
        ->and($purchase->wallet_transaction_id)->not->toBeNull()
        ->and((float) $this->wallet->fresh()->balance)->toBe(750.0);

    $transaction = WalletTransaction::query()->find($purchase->wallet_transaction_id);
    expect($transaction->type)->toBe(TransactionType::Debit)
        ->and((float) $transaction->amount)->toBe(250.0);
});

it('rolls back delivered items when the debit fails after delivery', function () {
    $mock = mockOfflineDeliveryQueue();

    $item = ShopItem::factory()->create(['price' => 250]);

    $this->actingAs($this->user)
        ->postJson("/shop/{$item->slug}/purchase")
        ->assertOk();

    $purchase = ShopPurchase::query()->where('purchasable_id', $item->id)->first();
    $queueId = $purchase->deliveries->first()->delivery_queue_id;

    // Balance drops below the price during the async delivery window
    $this->wallet->update(['balance' => 100]);

    $mock->shouldReceive('readResults')->andReturn(['results' => [
        ['id' => $queueId, 'status' => 'delivered'],
    ]]);
    $mock->shouldReceive('removeItem')
        ->once()
        ->with('testplayer', $item->item_type, Mockery::type('int'))
        ->andReturn(['id' => 'remove-1', 'status' => 'queued']);

    app(ShopDeliveryService::class)->processResults();

    $purchase->refresh();

    expect($purchase->delivery_status)->toBe(DeliveryStatus::Failed)
        ->and($purchase->wallet_transaction_id)->toBeNull()
        ->and($purchase->deliveries->first()->error_message)->toContain('Rolled back')
        ->and((float) $this->wallet->fresh()->balance)->toBe(100.0)
        ->and(WalletTransaction::query()->where('type', TransactionType::Debit)->exists())->toBeFalse();
});
