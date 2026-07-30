<?php

use App\Models\User;
use App\Services\ServerIniParser;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->tempDir = sys_get_temp_dir().'/pz_multi_mod_test_'.uniqid();
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

it('adds every mod id from one workshop upload in a single write', function () {
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '1111111111',
        'mod_id' => 'PackCore',
        'mod_ids' => ['PackCore', 'PackWeapons', 'PackVehicles'],
    ])->assertCreated();

    $config = (new ServerIniParser)->read($this->iniPath);

    expect($config['Mods'])->toContain('PackCore', 'PackWeapons', 'PackVehicles')
        // One upload, so the Workshop item is listed once.
        ->and(substr_count($config['WorkshopItems'], '1111111111'))->toBe(1);
});

it('keeps the given mod order', function () {
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '1111111111',
        'mod_id' => 'PackCore',
        'mod_ids' => ['PackCore', 'PackWeapons'],
    ])->assertCreated();

    $mods = (new ServerIniParser)->read($this->iniPath)['Mods'];

    expect(strpos($mods, 'PackCore'))->toBeLessThan(strpos($mods, 'PackWeapons'));
});

it('refuses the whole batch when any mod id is already installed', function () {
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '1111111111',
        'mod_id' => 'PackCore',
        'mod_ids' => ['PackCore', 'Hydrocraft'],
    ])->assertStatus(422);

    expect((new ServerIniParser)->read($this->iniPath)['Mods'])
        ->not->toContain('PackCore');
});

it('still accepts a lone mod id with no mod_ids list', function () {
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '1111111111',
        'mod_id' => 'SoloMod',
    ])->assertCreated();

    expect((new ServerIniParser)->read($this->iniPath)['Mods'])->toContain('SoloMod');
});

it('renames an installed mod id in place', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/mod-id', [
        'mod_id' => 'SuperSurvivors',
        'new_mod_id' => 'SuperSurvivorsFixed',
    ])
        ->assertOk()
        ->assertJson(['renamed' => true, 'mod_id' => 'SuperSurvivorsFixed', 'restart_required' => true]);

    $config = (new ServerIniParser)->read($this->iniPath);

    // Position is load order and must survive the rename.
    expect($config['Mods'])->toStartWith('SuperSurvivorsFixed;Hydrocraft')
        // Renaming the mod does not change which item gets downloaded.
        ->and($config['WorkshopItems'])->toContain('2561774086');
});

it('refuses to rename onto a mod id that is already installed', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/mod-id', [
        'mod_id' => 'SuperSurvivors',
        'new_mod_id' => 'Hydrocraft',
    ])->assertStatus(422);

    expect((new ServerIniParser)->read($this->iniPath)['Mods'])
        ->toContain('SuperSurvivors');
});

it('refuses to rename a mod that is not installed', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/mod-id', [
        'mod_id' => 'NotInstalled',
        'new_mod_id' => 'Whatever',
    ])->assertStatus(422);
});

it('refuses to rename the protected manager mod', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/mod-id', [
        'mod_id' => 'ZomboidManager',
        'new_mod_id' => 'NotTheManager',
    ])->assertStatus(422);
});

it('treats renaming a mod to its own id as a no-op', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/mod-id', [
        'mod_id' => 'SuperSurvivors',
        'new_mod_id' => 'SuperSurvivors',
    ])
        ->assertOk()
        ->assertJson(['renamed' => false, 'restart_required' => false]);
});

it('writes an audit log entry for a rename', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/mod-id', [
        'mod_id' => 'SuperSurvivors',
        'new_mod_id' => 'SuperSurvivorsFixed',
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'mod.mod_id.update',
        'target' => 'SuperSurvivors',
    ]);
});

it('requires authentication to rename a mod', function () {
    $this->putJson('/admin/mods/mod-id', [
        'mod_id' => 'SuperSurvivors',
        'new_mod_id' => 'Whatever',
    ])->assertUnauthorized();
});
