<?php

use App\Models\User;
use App\Models\WishlistMod;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
});

it('adds a workshop id to the wishlist', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => '2561774086'])
        ->assertCreated()
        ->assertJson(['workshop_id' => '2561774086']);

    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => '2561774086']);
});

it('is idempotent when adding an id already on the wishlist', function () {
    WishlistMod::factory()->create(['workshop_id' => '2561774086']);

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => '2561774086'])
        ->assertCreated();

    $this->assertDatabaseCount('wishlist_mods', 1);
});

it('rejects a non-numeric workshop id', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => 'not-a-number'])
        ->assertStatus(422);
});

it('removes a workshop id from the wishlist', function () {
    WishlistMod::factory()->create(['workshop_id' => '2561774086']);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/wishlist/2561774086')
        ->assertOk()
        ->assertJson(['removed' => '2561774086']);

    $this->assertDatabaseMissing('wishlist_mods', ['workshop_id' => '2561774086']);
});

it('returns 404 when removing an id that is not wishlisted', function () {
    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/wishlist/999')
        ->assertNotFound();
});

it('writes audit log entries for wishlist changes', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => '111'])
        ->assertCreated();
    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/wishlist/111')
        ->assertOk();

    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.wishlist.add', 'target' => '111']);
    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.wishlist.remove', 'target' => '111']);
});

it('passes the wishlist to the mods page newest first', function () {
    WishlistMod::factory()->create(['workshop_id' => '111', 'created_at' => now()->subDay()]);
    WishlistMod::factory()->create(['workshop_id' => '222', 'created_at' => now()]);

    $this->actingAs($this->admin)
        ->get('/admin/mods')
        ->assertInertia(fn ($page) => $page
            ->component('admin/mods')
            ->where('wishlist', ['222', '111'])
        );
});

it('requires authentication for wishlist endpoints', function () {
    $this->postJson('/admin/mods/wishlist', ['workshop_id' => '111'])
        ->assertUnauthorized();
});

// ── Bulk import ──────────────────────────────────────────────────────

it('bulk imports workshop ids, skipping ones already on the wishlist', function () {
    WishlistMod::factory()->create(['workshop_id' => '222']);

    $response = $this->actingAs($this->admin)->postJson('/admin/mods/wishlist/import', [
        'workshop_ids' => ['111', '222', '333'],
    ]);

    $response->assertCreated()
        ->assertJson(['added' => ['111', '333'], 'skipped' => 1]);

    $this->assertDatabaseCount('wishlist_mods', 3);
});

it('bulk import skips duplicate ids within the same payload', function () {
    $response = $this->actingAs($this->admin)->postJson('/admin/mods/wishlist/import', [
        'workshop_ids' => ['111', '111', '111'],
    ]);

    $response->assertCreated()->assertJson(['added' => ['111'], 'skipped' => 2]);
    $this->assertDatabaseCount('wishlist_mods', 1);
});

it('bulk import skips workshop ids that are already installed', function () {
    $tempDir = sys_get_temp_dir().'/pz_wishlist_import_test_'.uniqid();
    mkdir($tempDir.'/Server', 0777, true);
    $iniPath = $tempDir.'/Server/ZomboidServer.ini';
    copy(base_path('tests/fixtures/server.ini'), $iniPath);
    config(['zomboid.paths.server_ini' => $iniPath]);

    $workshopContentPath = $tempDir.'/workshop_content';
    mkdir($workshopContentPath, 0777, true);
    config(['zomboid.paths.workshop_content' => $workshopContentPath]);
    // Fixture ini's Mods= includes SuperSurvivors; resolve it to 2561774086
    // so ModManager::list() reports it installed under that workshop id.
    seedWorkshopMod($workshopContentPath, '2561774086', 'SuperSurvivors');

    $response = $this->actingAs($this->admin)->postJson('/admin/mods/wishlist/import', [
        'workshop_ids' => ['2561774086', '999'],
    ]);

    $response->assertCreated()->assertJson(['added' => ['999'], 'skipped' => 1]);
    $this->assertDatabaseMissing('wishlist_mods', ['workshop_id' => '2561774086']);

    rrmdir($workshopContentPath);
    @unlink($iniPath);
    @rmdir($tempDir.'/Server');
    @rmdir($tempDir);
});

it('rejects an empty workshop_ids array on bulk import', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist/import', ['workshop_ids' => []])
        ->assertStatus(422);
});

it('rejects non-numeric ids on bulk import', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist/import', ['workshop_ids' => ['not-a-number']])
        ->assertStatus(422);
});

it('writes an audit log entry for bulk wishlist imports', function () {
    $this->actingAs($this->admin)->postJson('/admin/mods/wishlist/import', [
        'workshop_ids' => ['111', '222'],
    ])->assertCreated();

    $this->assertDatabaseHas('audit_logs', ['action' => 'mod.wishlist.import']);
});

it('requires authentication for bulk wishlist import', function () {
    $this->postJson('/admin/mods/wishlist/import', ['workshop_ids' => ['111']])
        ->assertUnauthorized();
});
