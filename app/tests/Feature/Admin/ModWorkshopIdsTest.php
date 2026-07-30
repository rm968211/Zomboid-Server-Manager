<?php

use App\Models\ModWorkshopLink;
use App\Models\User;
use App\Services\ServerIniParser;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->admin = User::factory()->admin()->create();
    $this->tempDir = sys_get_temp_dir().'/pz_ws_ids_test_'.uniqid();
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

it('adds a mod with several workshop ids, enabling it once', function () {
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '1111111111',
        'workshop_ids' => ['1111111111', '2222222222', '3333333333'],
        'mod_id' => 'SplitMod',
    ])->assertCreated();

    $config = (new ServerIniParser)->read($this->iniPath);

    expect($config['WorkshopItems'])->toContain('1111111111', '2222222222', '3333333333')
        // Extra Workshop items are downloads, not separate mods to enable.
        ->and(substr_count($config['Mods'], 'SplitMod'))->toBe(1);

    expect(ModWorkshopLink::query()->where('mod_id', 'SplitMod')->pluck('workshop_id')->all())
        ->toEqualCanonicalizing(['1111111111', '2222222222', '3333333333']);
});

it('still adds a mod whose workshop item is already installed', function () {
    // Second mod from an upload that is already in WorkshopItems= — the old
    // early-return dropped it silently.
    $this->actingAs($this->admin)->postJson('/admin/mods', [
        'workshop_id' => '2561774086',
        'mod_id' => 'SecondModFromSameUpload',
    ])->assertCreated();

    expect((new ServerIniParser)->read($this->iniPath)['Mods'])
        ->toContain('SecondModFromSameUpload');
});

it('reports every workshop id a mod needs on the mods page', function () {
    seedWorkshopMod($this->workshopContentPath, '1111111111', 'SplitMod');
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod',
        'WorkshopItems' => '1111111111;2222222222',
    ]);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '1111111111']);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '2222222222']);

    $this->actingAs($this->admin)
        ->get('/admin/mods')
        ->assertInertia(fn ($page) => $page
            ->component('admin/mods')
            ->where('mods.0.mod_id', 'SplitMod')
            ->where('mods.0.workshop_ids', ['1111111111', '2222222222'])
        );
});

it('falls back to the scanned workshop id when no links are stored', function () {
    seedWorkshopMod($this->workshopContentPath, '1111111111', 'PlainMod');
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'PlainMod',
        'WorkshopItems' => '1111111111',
    ]);

    $this->actingAs($this->admin)
        ->get('/admin/mods')
        ->assertInertia(fn ($page) => $page
            ->where('mods.0.workshop_ids', ['1111111111'])
        );
});

it('adds newly listed workshop ids to WorkshopItems when editing a mod', function () {
    seedWorkshopMod($this->workshopContentPath, '1111111111', 'SplitMod');
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod',
        'WorkshopItems' => '1111111111',
    ]);

    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SplitMod',
        'workshop_ids' => ['1111111111', '4444444444'],
    ])
        ->assertOk()
        ->assertJson(['added' => ['4444444444'], 'removed' => [], 'restart_required' => true]);

    expect((new ServerIniParser)->read($this->iniPath)['WorkshopItems'])
        ->toContain('1111111111', '4444444444');
});

it('drops a removed workshop id from WorkshopItems', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod',
        'WorkshopItems' => '1111111111;4444444444',
    ]);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '1111111111']);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '4444444444']);

    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SplitMod',
        'workshop_ids' => ['1111111111'],
    ])
        ->assertOk()
        ->assertJson(['removed' => ['4444444444']]);

    expect((new ServerIniParser)->read($this->iniPath)['WorkshopItems'])
        ->not->toContain('4444444444');
});

it('keeps a workshop item another installed mod still needs', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod;SiblingMod',
        'WorkshopItems' => '1111111111;4444444444',
    ]);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '1111111111']);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '4444444444']);
    ModWorkshopLink::query()->create(['mod_id' => 'SiblingMod', 'workshop_id' => '4444444444']);

    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SplitMod',
        'workshop_ids' => ['1111111111'],
    ])
        ->assertOk()
        ->assertJson(['removed' => []]);

    expect((new ServerIniParser)->read($this->iniPath)['WorkshopItems'])
        ->toContain('4444444444');
});

it('never detaches the manager mod workshop item', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod;ZomboidManager',
        'WorkshopItems' => '3685323705',
    ]);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '3685323705']);

    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SplitMod',
        'workshop_ids' => [],
    ])->assertOk();

    expect((new ServerIniParser)->read($this->iniPath)['WorkshopItems'])
        ->toContain('3685323705');
});

it('returns 404 when editing a mod that is not installed', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'NotInstalled',
        'workshop_ids' => ['1111111111'],
    ])->assertNotFound();
});

it('rejects a non-numeric workshop id when editing', function () {
    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SuperSurvivors',
        'workshop_ids' => ['not-a-number'],
    ])->assertStatus(422);
});

it('forgets a mod\'s workshop links when the mod is removed', function () {
    seedWorkshopMod($this->workshopContentPath, '1111111111', 'SplitMod');
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod',
        'WorkshopItems' => '1111111111',
    ]);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '1111111111']);

    $this->actingAs($this->admin)
        ->deleteJson('/admin/mods/1111111111', ['mod_id' => 'SplitMod'])
        ->assertOk();

    $this->assertDatabaseCount('mod_workshop_links', 0);
});

it('writes an audit log entry when workshop ids change', function () {
    (new ServerIniParser)->write($this->iniPath, [
        'Mods' => 'SplitMod',
        'WorkshopItems' => '1111111111',
    ]);
    ModWorkshopLink::query()->create(['mod_id' => 'SplitMod', 'workshop_id' => '1111111111']);

    $this->actingAs($this->admin)->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SplitMod',
        'workshop_ids' => ['1111111111', '5555555555'],
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'mod.workshop_ids.update',
        'target' => 'SplitMod',
    ]);
});

it('requires authentication to edit workshop ids', function () {
    $this->putJson('/admin/mods/workshop-ids', [
        'mod_id' => 'SplitMod',
        'workshop_ids' => [],
    ])->assertUnauthorized();
});
