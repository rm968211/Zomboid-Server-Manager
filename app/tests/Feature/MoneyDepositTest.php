<?php

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WhitelistEntry;
use App\Services\MoneyDepositManager;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Covers the items-first deposit flow: Lua removes in-game money and reports
 * a result; crediting must be exactly-once and only for verified successes.
 */
beforeEach(function () {
    $this->depositDir = sys_get_temp_dir().'/pz_deposit_test_'.uniqid();
    mkdir($this->depositDir, 0755, true);
    $this->requestsPath = $this->depositDir.'/requests.json';
    $this->resultsPath = $this->depositDir.'/results.json';
    $this->manager = new MoneyDepositManager($this->requestsPath, $this->resultsPath);

    $this->user = User::factory()->create();
    $this->user->whitelistEntries()->save(
        WhitelistEntry::factory()->make(['pz_username' => 'testplayer', 'active' => true])
    );
    Wallet::factory()->for($this->user)->create(['balance' => 0, 'total_earned' => 0, 'total_spent' => 0]);
});

afterEach(function () {
    exec('rm -rf '.escapeshellarg($this->depositDir));
});

function writeDepositResults(string $path, array $results): void
{
    file_put_contents($path, json_encode([
        'version' => 1,
        'updated_at' => date('c'),
        'results' => $results,
    ]));
}

it('credits the wallet for a successful deposit result', function () {
    writeDepositResults($this->resultsPath, [
        ['id' => 'dep-1', 'username' => 'testplayer', 'status' => 'success', 'total_coins' => 500, 'money_count' => 500],
    ]);

    $credited = $this->manager->processResults(app(WalletService::class));

    expect($credited)->toBe(['dep-1'])
        ->and(app(WalletService::class)->getBalance($this->user))->toBe(500.0);

    $transaction = WalletTransaction::query()->where('reference_id', 'dep-1')->first();
    expect($transaction)->not->toBeNull()
        ->and((float) $transaction->amount)->toBe(500.0);
});

it('credits a result exactly once when processed repeatedly', function () {
    writeDepositResults($this->resultsPath, [
        ['id' => 'dep-1', 'username' => 'testplayer', 'status' => 'success', 'total_coins' => 500, 'money_count' => 500],
    ]);

    $this->manager->processResults(app(WalletService::class));
    $credited = $this->manager->processResults(app(WalletService::class));

    // Second pass still reports the ID (so the file gets cleaned) but must not re-credit
    expect($credited)->toBe(['dep-1'])
        ->and(app(WalletService::class)->getBalance($this->user))->toBe(500.0)
        ->and(WalletTransaction::query()->where('reference_id', 'dep-1')->count())->toBe(1);
});

it('does not credit failed results or unknown players', function () {
    writeDepositResults($this->resultsPath, [
        ['id' => 'dep-fail', 'username' => 'testplayer', 'status' => 'failed', 'total_coins' => 0, 'money_count' => 0],
        ['id' => 'dep-ghost', 'username' => 'nobody', 'status' => 'success', 'total_coins' => 100, 'money_count' => 100],
    ]);

    $credited = $this->manager->processResults(app(WalletService::class));

    expect($credited)->toBe([])
        ->and(app(WalletService::class)->getBalance($this->user))->toBe(0.0)
        ->and(WalletTransaction::query()->count())->toBe(0);
});

it('removes only credited results and keeps failures for the UI', function () {
    writeDepositResults($this->resultsPath, [
        ['id' => 'dep-1', 'username' => 'testplayer', 'status' => 'success', 'total_coins' => 500, 'money_count' => 500],
        ['id' => 'dep-fail', 'username' => 'testplayer', 'status' => 'failed', 'total_coins' => 0, 'money_count' => 0],
    ]);

    $credited = $this->manager->processResults(app(WalletService::class));
    $this->manager->removeProcessedResults($credited);

    $remaining = json_decode(file_get_contents($this->resultsPath), true)['results'];

    expect(array_column($remaining, 'id'))->toBe(['dep-fail']);
});
