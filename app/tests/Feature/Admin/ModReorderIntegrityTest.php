<?php

use App\Models\User;
use App\Services\ServerIniParser;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->tempDir = sys_get_temp_dir().'/pz_reorder_test_'.uniqid();
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

it('does not duplicate a workshop item that provides two enabled mods', function () {
    // The live failure: one upload with two enabled mods sends two rows, and
    // rebuilding WorkshopItems= from them listed the item twice. PZ then shows
    // the duplicate as a bare, nameless ID in the join screen.
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'RepairAnyClothes;RepairAnyMod',
        'WorkshopItems' => '2142622992',
    ]);

    $this->actingAs($this->admin)->putJson('/admin/mods/order', [
        'mods' => [
            ['workshop_id' => '2142622992', 'mod_id' => 'RepairAnyMod'],
            ['workshop_id' => '2142622992', 'mod_id' => 'RepairAnyClothes'],
        ],
    ])->assertOk();

    $config = (new ServerIniParser)->read($this->iniPath);

    expect(substr_count($config['WorkshopItems'], '2142622992'))->toBe(1)
        ->and($config['Mods'])->toStartWith('RepairAnyMod;RepairAnyClothes');
});

it('keeps a workshop item whose mods are all disabled', function () {
    // Rebuilding WorkshopItems= from the mod rows also silently dropped items
    // that no enabled mod maps to — content the admin is still downloading.
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SuperSurvivors',
        'WorkshopItems' => '2561774086;9999999999',
    ]);

    $this->actingAs($this->admin)->putJson('/admin/mods/order', [
        'mods' => [['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors']],
    ])->assertOk();

    expect((new ServerIniParser)->read($this->iniPath)['WorkshopItems'])
        ->toContain('9999999999');
});

it('repairs an already-duplicated workshop items line on the next write', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'RepairAnyClothes;RepairAnyMod',
        'WorkshopItems' => '2142622992;2142622992',
    ]);

    $this->actingAs($this->admin)->putJson('/admin/mods/order', [
        'mods' => [
            ['workshop_id' => '2142622992', 'mod_id' => 'RepairAnyClothes'],
            ['workshop_id' => '2142622992', 'mod_id' => 'RepairAnyMod'],
        ],
    ])->assertOk();

    expect(substr_count((new ServerIniParser)->read($this->iniPath)['WorkshopItems'], '2142622992'))
        ->toBe(1);
});

it('does not renumber a mod with no resolvable workshop item into an empty entry', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'LocalMod;SuperSurvivors',
        'WorkshopItems' => '2561774086',
    ]);

    $this->actingAs($this->admin)->putJson('/admin/mods/order', [
        'mods' => [
            ['workshop_id' => '', 'mod_id' => 'LocalMod'],
            ['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors'],
        ],
    ])->assertOk();

    $items = (new ServerIniParser)->read($this->iniPath)['WorkshopItems'];

    expect($items)->not->toContain(';;')
        ->and($items)->toContain('2561774086');
});

it('still refuses a reorder that drops the protected manager mod', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'ZomboidManager;SuperSurvivors',
        'WorkshopItems' => '3685323705;2561774086',
    ]);

    $this->actingAs($this->admin)->putJson('/admin/mods/order', [
        'mods' => [['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors']],
    ])->assertStatus(422);
});
