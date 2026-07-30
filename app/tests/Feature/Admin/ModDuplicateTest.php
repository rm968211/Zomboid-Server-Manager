<?php

use App\Models\User;
use App\Models\WishlistMod;
use App\Services\ServerIniParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    Http::fake();

    $this->admin = User::factory()->admin()->create();
    $this->tempDir = sys_get_temp_dir().'/pz_dupe_test_'.uniqid();
    mkdir($this->tempDir.'/Server', 0777, true);
    $this->iniPath = $this->tempDir.'/Server/ZomboidServer.ini';
    copy(base_path('tests/fixtures/server.ini'), $this->iniPath);
    config(['zomboid.paths.server_ini' => $this->iniPath]);

    $this->workshopContentPath = $this->tempDir.'/workshop_content';
    mkdir($this->workshopContentPath, 0777, true);
    config(['zomboid.paths.workshop_content' => $this->workshopContentPath]);
});

afterEach(function () {
    @unlink($this->tempDir.'/Server/.mod_state');
    @unlink($this->tempDir.'/Server/.mod_state_applied');
    @unlink($this->tempDir.'/Server/.config_state');
    @unlink($this->tempDir.'/Server/.config_state.lock');
    @unlink($this->iniPath);
    @rmdir($this->tempDir.'/Server');
    rrmdir($this->workshopContentPath);
    @rmdir($this->tempDir);
});

it('refuses to install a mod id that is already installed', function () {
    // Fixture Mods= is SuperSurvivors;Hydrocraft.
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '9999999999',
        'mod_id' => 'SuperSurvivors',
    ])->assertStatus(422);

    $config = (new ServerIniParser)->read($this->iniPath);

    expect(substr_count($config['Mods'], 'SuperSurvivors'))->toBe(1)
        ->and($config['WorkshopItems'])->not->toContain('9999999999');
});

it('still allows a second mod from an already-installed workshop item', function () {
    // The Workshop ID repeats but the mod ID does not — that is how a
    // multi-mod upload gets its other mods enabled, and must not be blocked.
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '2561774086',
        'mod_id' => 'SuperSurvivorsAddon',
    ])->assertCreated();

    expect((new ServerIniParser)->read($this->iniPath)['Mods'])
        ->toContain('SuperSurvivorsAddon');
});

it('refuses to wishlist a mod that is already installed', function () {
    seedWorkshopMod($this->workshopContentPath, '2561774086', 'SuperSurvivors');

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => '2561774086'])
        ->assertStatus(422);

    $this->assertDatabaseCount('wishlist_mods', 0);
});

it('refuses to wishlist a mod that is already wishlisted', function () {
    WishlistMod::factory()->create(['workshop_id' => '4242424242']);

    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => '4242424242'])
        ->assertStatus(422);

    $this->assertDatabaseCount('wishlist_mods', 1);
});

it('still wishlists a mod that is neither installed nor wishlisted', function () {
    $this->actingAs($this->admin)
        ->postJson('/admin/mods/wishlist', ['workshop_id' => '4242424242'])
        ->assertCreated();

    $this->assertDatabaseHas('wishlist_mods', ['workshop_id' => '4242424242']);
});
