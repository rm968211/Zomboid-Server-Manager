<?php

use App\Models\User;
use App\Models\WatchlistMod;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
});

it('adds a workshop id to the watchlist', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/watchlist', ['workshop_id' => '2561774086'])
        ->assertCreated()
        ->assertJson(['workshop_id' => '2561774086']);

    $this->assertDatabaseHas('watchlist_mods', ['workshop_id' => '2561774086']);
});

it('is idempotent when adding an id already on the watchlist', function () {
    WatchlistMod::factory()->create(['workshop_id' => '2561774086']);

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/watchlist', ['workshop_id' => '2561774086'])
        ->assertCreated();

    $this->assertDatabaseCount('watchlist_mods', 1);
});

it('rejects a non-numeric workshop id', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/watchlist', ['workshop_id' => 'not-a-number'])
        ->assertStatus(422);
});

it('removes a workshop id from the watchlist', function () {
    WatchlistMod::factory()->create(['workshop_id' => '2561774086']);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/watchlist/2561774086')
        ->assertOk()
        ->assertJson(['removed' => '2561774086']);

    $this->assertDatabaseMissing('watchlist_mods', ['workshop_id' => '2561774086']);
});

it('returns 404 when removing an id that is not watched', function () {
    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/watchlist/999')
        ->assertNotFound();
});

it('writes audit log entries for watchlist changes', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/watchlist', ['workshop_id' => '111'])
        ->assertCreated();
    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/watchlist/111')
        ->assertOk();

    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.watchlist.add', 'target' => '111']);
    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.watchlist.remove', 'target' => '111']);
});

it('passes the watchlist to the mods page newest first', function () {
    WatchlistMod::factory()->create(['workshop_id' => '111', 'created_at' => now()->subDay()]);
    WatchlistMod::factory()->create(['workshop_id' => '222', 'created_at' => now()]);

    $this->actingAs($this->admin)
        ->get('/admin/mods')
        ->assertInertia(fn ($page) => $page
            ->component('admin/mods')
            ->where('watchlist', ['222', '111'])
        );
});

it('requires authentication for watchlist endpoints', function () {
    $this->postJson('/admin/mods/watchlist', ['workshop_id' => '111'])
        ->assertUnauthorized();
});
