<?php

use App\Models\User;
use App\Services\ServerIniParser;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->tempDir = sys_get_temp_dir().'/pz_mod_dep_test_'.uniqid();
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
    @unlink($this->iniPath);
    @rmdir($this->tempDir.'/Server');
    rrmdir($this->workshopContentPath);
    @rmdir($this->tempDir);
});

it('refuses to remove a mod that another installed mod still requires', function () {
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'BasePack');
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'AddonA', ['BasePack']);
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'BasePack;AddonA',
        'WorkshopItems' => '5000000000',
    ]);

    $response = $this->actingAs($this->admin)->deleteJson('/admin/mods/5000000000', [
        'mod_id' => 'BasePack',
    ]);

    $response->assertStatus(422)
        ->assertJson(['dependents' => ['AddonA']]);

    expect((new ServerIniParser)->read($this->iniPath)['Mods'])->toContain('BasePack');
});

it('allows removing a mod once the mods depending on it are already gone', function () {
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'BasePack');
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'BasePack',
        'WorkshopItems' => '5000000000',
    ]);

    $response = $this->actingAs($this->admin)->deleteJson('/admin/mods/5000000000', [
        'mod_id' => 'BasePack',
    ]);

    $response->assertOk()->assertJson(['removed' => ['workshop_id' => '5000000000', 'mod_id' => 'BasePack']]);
});
