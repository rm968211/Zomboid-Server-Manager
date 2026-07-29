<?php

use App\Services\ConfigStateManager;
use App\Services\ModManager;
use App\Services\ServerIniParser;

beforeEach(function () {
    $this->parser = new ServerIniParser;
    $this->manager = new ModManager($this->parser, new ConfigStateManager);
    $this->tempDir = sys_get_temp_dir().'/pz_test_'.uniqid();
    mkdir($this->tempDir.'/Server', 0777, true);
    $this->iniPath = $this->tempDir.'/Server/ZomboidServer.ini';
    $this->configStatePath = $this->tempDir.'/Server/.config_state';
    copy(dirname(__DIR__).'/fixtures/server.ini', $this->iniPath);

    // Downloaded Workshop content used to resolve workshop_id by scanning
    // mod.info, mirroring how a single Workshop item can bundle several mods.
    $this->workshopContentPath = $this->tempDir.'/workshop_content';
    mkdir($this->workshopContentPath, 0777, true);
    foreach ([
        ['2561774086', 'SuperSurvivors'],
        ['2286126274', 'Hydrocraft'],
        ['3685323705', 'ZomboidManager'],
        ['1111111111', 'TestMod'],
        ['1111111111', 'NewMod'],
        ['9999999999', 'MapMod'],
        ['9999999999', 'StateMod'],
    ] as [$workshopId, $modId]) {
        seedWorkshopMod($this->workshopContentPath, $workshopId, $modId);
    }
});

afterEach(function () {
    if (file_exists($this->iniPath)) {
        unlink($this->iniPath);
    }
    foreach (['.mod_state', '.mod_state_applied', '.config_state', '.config_state.lock'] as $sidecar) {
        $path = $this->tempDir.'/Server/'.$sidecar;
        if (file_exists($path)) {
            unlink($path);
        }
    }
    if (is_dir($this->tempDir.'/Server')) {
        rmdir($this->tempDir.'/Server');
    }
    rrmdir($this->workshopContentPath);
    if (is_dir($this->tempDir)) {
        rmdir($this->tempDir);
    }
});

it('lists mods from ini file', function () {
    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toHaveCount(2)
        ->and($mods[0]['workshop_id'])->toBe('2561774086')
        ->and($mods[0]['mod_id'])->toBe('SuperSurvivors')
        ->and($mods[1]['workshop_id'])->toBe('2286126274')
        ->and($mods[1]['mod_id'])->toBe('Hydrocraft');
});

it('returns blank workshop_id for every mod when no workshop content path is given', function () {
    $mods = $this->manager->list($this->iniPath);

    expect($mods[0]['workshop_id'])->toBe('')
        ->and($mods[1]['workshop_id'])->toBe('');
});

it('returns blank workshop_id for a mod not found on disk', function () {
    $this->parser->write($this->iniPath, ['Mods' => 'UnknownMod', 'WorkshopItems' => '']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toHaveCount(1)
        ->and($mods[0]['mod_id'])->toBe('UnknownMod')
        ->and($mods[0]['workshop_id'])->toBe('');
});

it('resolves workshop_id by scanning mod.info when one Workshop item bundles multiple mods', function () {
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'BundleModA');
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'BundleModB');
    $this->parser->write($this->iniPath, [
        'Mods' => 'BundleModA;BundleModB',
        'WorkshopItems' => '5000000000',
    ]);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toHaveCount(2)
        ->and($mods[0]['workshop_id'])->toBe('5000000000')
        ->and($mods[1]['workshop_id'])->toBe('5000000000');
});

it('resolves workshop_id from mod.info nested one level down (e.g. common/mod.info)', function () {
    $modDir = $this->workshopContentPath.'/6000000000/mods/NestedMod/common';
    mkdir($modDir, 0777, true);
    file_put_contents($modDir.'/mod.info', "id=NestedMod\n");
    $this->parser->write($this->iniPath, ['Mods' => 'NestedMod', 'WorkshopItems' => '6000000000']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods[0]['workshop_id'])->toBe('6000000000');
});

it('reports requires from mod.info and required_by for dependents that are enabled', function () {
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'BasePack');
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'AddonA', ['BasePack']);
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'AddonB', ['BasePack', 'AddonA']);
    $this->parser->write($this->iniPath, [
        'Mods' => 'BasePack;AddonA;AddonB',
        'WorkshopItems' => '5000000000',
    ]);

    $mods = collect($this->manager->list($this->iniPath, $this->workshopContentPath))->keyBy('mod_id');

    expect($mods['BasePack']['requires'])->toBe([])
        ->and($mods['BasePack']['required_by'])->toEqualCanonicalizing(['AddonA', 'AddonB'])
        ->and($mods['AddonA']['requires'])->toBe(['BasePack'])
        ->and($mods['AddonA']['required_by'])->toBe(['AddonB'])
        ->and($mods['AddonB']['requires'])->toBe(['BasePack', 'AddonA'])
        ->and($mods['AddonB']['required_by'])->toBe([]);
});

it('lists a declared requirement even when that mod is not currently installed', function () {
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'AddonA', ['MissingBase']);
    $this->parser->write($this->iniPath, ['Mods' => 'AddonA', 'WorkshopItems' => '5000000000']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods[0]['requires'])->toBe(['MissingBase']);
});

it('strips a stray leading backslash from require= dependency names', function () {
    $modDir = $this->workshopContentPath.'/5000000000/mods/AddonA';
    mkdir($modDir, 0777, true);
    file_put_contents($modDir.'/mod.info', "id=AddonA\nrequire=\\BasePack\n");
    $this->parser->write($this->iniPath, ['Mods' => 'AddonA', 'WorkshopItems' => '5000000000']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods[0]['requires'])->toBe(['BasePack']);
});

it('findDependents returns the currently-enabled mods that require the given mod', function () {
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'BasePack');
    seedWorkshopMod($this->workshopContentPath, '5000000000', 'AddonA', ['BasePack']);
    $this->parser->write($this->iniPath, ['Mods' => 'BasePack;AddonA', 'WorkshopItems' => '5000000000']);

    expect($this->manager->findDependents($this->iniPath, $this->workshopContentPath, 'BasePack'))
        ->toBe(['AddonA'])
        ->and($this->manager->findDependents($this->iniPath, $this->workshopContentPath, 'AddonA'))
        ->toBe([]);
});

it('adds a mod to both lists', function () {
    $this->manager->add($this->iniPath, '1111111111', 'TestMod');

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    // Existing fixture (2) + user-added (1) + auto-attached ZomboidManager (1) = 4
    expect($mods)->toHaveCount(4)
        ->and($mods[2]['workshop_id'])->toBe('1111111111')
        ->and($mods[2]['mod_id'])->toBe('TestMod')
        ->and($mods[3]['mod_id'])->toBe('ZomboidManager');
});

it('prevents duplicate workshop ids', function () {
    $this->manager->add($this->iniPath, '2561774086', 'SuperSurvivors');

    expect($this->manager->list($this->iniPath, $this->workshopContentPath))->toHaveCount(2);
});

it('removes a mod from both lists', function () {
    $removed = $this->manager->remove($this->iniPath, '2561774086');

    expect($removed)->toBe(['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);
    // Hydrocraft survives + auto-attached ZomboidManager
    expect($mods)->toHaveCount(2)
        ->and($mods[0]['workshop_id'])->toBe('2286126274')
        ->and($mods[1]['mod_id'])->toBe('ZomboidManager');
});

it('returns null when removing nonexistent mod', function () {
    expect($this->manager->remove($this->iniPath, '0000000000'))->toBeNull();
});

it('removes by mod_id, leaving WorkshopItems untouched, when several mods share a workshop_id', function () {
    $this->parser->write($this->iniPath, [
        'Mods' => 'BundleModA;BundleModB',
        'WorkshopItems' => '5000000000',
    ]);

    $removed = $this->manager->remove($this->iniPath, '5000000000', modId: 'BundleModB');

    expect($removed)->toBe(['workshop_id' => '5000000000', 'mod_id' => 'BundleModB']);

    $stateContent = file_get_contents($this->tempDir.'/Server/.mod_state');
    expect($stateContent)->toContain('Mods=BundleModA')
        ->and($stateContent)->not->toContain('BundleModB')
        // WorkshopItems is left alone — BundleModA still needs this Workshop item.
        ->and($stateContent)->toContain('WorkshopItems=5000000000');
});

it('returns null removing by mod_id when that mod is not present', function () {
    expect($this->manager->remove($this->iniPath, '2561774086', modId: 'NotInstalled'))->toBeNull();
});

it('reorders mods', function () {
    $this->manager->reorder($this->iniPath, [
        ['workshop_id' => '2286126274', 'mod_id' => 'Hydrocraft'],
        ['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors'],
    ]);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);
    expect($mods[0]['workshop_id'])->toBe('2286126274')
        ->and($mods[1]['workshop_id'])->toBe('2561774086');
});

it('handles empty mod list', function () {
    // Clear mods
    $this->parser->write($this->iniPath, ['Mods' => '', 'WorkshopItems' => '']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toBe([]);
});

it('adds map folder when adding map mod', function () {
    $this->manager->add($this->iniPath, '9999999999', 'MapMod', 'CustomMap');

    $config = $this->parser->read($this->iniPath);

    expect($config['Map'])->toContain('CustomMap');
});

it('removes map folder when removing map mod', function () {
    // First add a map mod
    $this->manager->add($this->iniPath, '9999999999', 'MapMod', 'CustomMap');

    // Then remove it with map folder
    $this->manager->remove($this->iniPath, '9999999999', 'CustomMap');

    $config = $this->parser->read($this->iniPath);

    expect($config['Map'])->not->toContain('CustomMap');
});

it('writes mod state file when adding a mod', function () {
    $this->manager->add($this->iniPath, '1111111111', 'TestMod');

    $stateFile = $this->tempDir.'/Server/.mod_state';

    expect(file_exists($stateFile))->toBeTrue();

    $content = file_get_contents($stateFile);
    expect($content)->toContain('Mods=SuperSurvivors;Hydrocraft;TestMod;ZomboidManager')
        ->and($content)->toContain('WorkshopItems=2561774086;2286126274;1111111111;3685323705');
});

it('writes mod state file when removing a mod', function () {
    $this->manager->remove($this->iniPath, '2561774086');

    $stateFile = $this->tempDir.'/Server/.mod_state';

    expect(file_exists($stateFile))->toBeTrue();

    $content = file_get_contents($stateFile);
    expect($content)->toContain('Mods=Hydrocraft;ZomboidManager')
        ->and($content)->toContain('WorkshopItems=2286126274;3685323705');
});

it('writes mod state file when reordering mods', function () {
    $this->manager->reorder($this->iniPath, [
        ['workshop_id' => '2286126274', 'mod_id' => 'Hydrocraft'],
        ['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors'],
    ]);

    $stateFile = $this->tempDir.'/Server/.mod_state';

    expect(file_exists($stateFile))->toBeTrue();

    $content = file_get_contents($stateFile);
    expect($content)->toContain('Mods=Hydrocraft;SuperSurvivors;ZomboidManager')
        ->and($content)->toContain('WorkshopItems=2286126274;2561774086;3685323705');
});

it('does not write mod state file when adding duplicate mod', function () {
    $stateFile = $this->tempDir.'/Server/.mod_state';
    if (file_exists($stateFile)) {
        unlink($stateFile);
    }

    $this->manager->add($this->iniPath, '2561774086', 'SuperSurvivors');

    expect(file_exists($stateFile))->toBeFalse();
});

it('does not write mod state file when removing nonexistent mod', function () {
    $stateFile = $this->tempDir.'/Server/.mod_state';
    if (file_exists($stateFile)) {
        unlink($stateFile);
    }

    $this->manager->remove($this->iniPath, '0000000000');

    expect(file_exists($stateFile))->toBeFalse();
});

it('flags protected workshop ids', function () {
    expect(ModManager::isProtected('3685323705'))->toBeTrue()
        ->and(ModManager::isProtected('1111111111'))->toBeFalse();
});

it('allows reorder that keeps required mod', function () {
    $this->manager->add($this->iniPath, '3685323705', 'ZomboidManager');

    $this->manager->reorder($this->iniPath, [
        ['workshop_id' => '3685323705', 'mod_id' => 'ZomboidManager'],
        ['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors'],
        ['workshop_id' => '2286126274', 'mod_id' => 'Hydrocraft'],
    ]);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);
    expect($mods[0]['workshop_id'])->toBe('3685323705');
});

it('throws RuntimeException when state file directory is not writable', function () {
    chmod($this->tempDir.'/Server', 0555);

    try {
        expect(fn () => $this->manager->add($this->iniPath, '1111111111', 'TestMod'))
            ->toThrow(RuntimeException::class);
    } finally {
        chmod($this->tempDir.'/Server', 0777);
    }
})->skip(getmyuid() === 0, 'chmod restrictions are bypassed by root');

it('lists mods from .mod_state when state file exists, ignoring INI', function () {
    file_put_contents(
        $this->tempDir.'/Server/.mod_state',
        "Mods=StateMod\nWorkshopItems=9999999999\n"
    );

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toHaveCount(1)
        ->and($mods[0]['mod_id'])->toBe('StateMod')
        ->and($mods[0]['workshop_id'])->toBe('9999999999');
});

it('returns empty list when .mod_state has empty mod values', function () {
    file_put_contents(
        $this->tempDir.'/Server/.mod_state',
        "Mods=\nWorkshopItems=\n"
    );

    expect($this->manager->list($this->iniPath, $this->workshopContentPath))->toBe([]);
});

it('falls back to INI when .mod_state is malformed', function () {
    file_put_contents(
        $this->tempDir.'/Server/.mod_state',
        'garbage content with no recognizable lines'
    );

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toHaveCount(2)
        ->and($mods[0]['mod_id'])->toBe('SuperSurvivors');
});

it('falls back to INI when .mod_state is missing WorkshopItems line', function () {
    file_put_contents(
        $this->tempDir.'/Server/.mod_state',
        "Mods=StateMod\n"
    );

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    expect($mods)->toHaveCount(2)
        ->and($mods[0]['mod_id'])->toBe('SuperSurvivors');
});

it('returns state-file mods even when INI was clobbered to empty', function () {
    $this->manager->add($this->iniPath, '1111111111', 'TestMod');
    $this->parser->write($this->iniPath, ['Mods' => '', 'WorkshopItems' => '']);

    $mods = $this->manager->list($this->iniPath, $this->workshopContentPath);

    // 2 fixture + 1 added + auto ZomboidManager
    expect($mods)->toHaveCount(4)
        ->and(collect($mods)->pluck('mod_id')->all())->toContain('TestMod')
        ->and(collect($mods)->pluck('mod_id')->all())->toContain('ZomboidManager');
});

it('preserves mods from .mod_state when the INI was pruned by PZ on shutdown', function () {
    // Simulate PZ rewriting the INI with empty Mods= after a shutdown, while
    // .mod_state (web-UI source of truth) still reflects the user's choices.
    file_put_contents(
        $this->tempDir.'/Server/.mod_state',
        "Mods=Hydrocraft;ZomboidManager\nWorkshopItems=2286126274;3685323705\n"
    );
    $this->parser->write($this->iniPath, ['Mods' => '', 'WorkshopItems' => '']);

    $this->manager->add($this->iniPath, '4242424242', 'NewMod');

    $stateContent = file_get_contents($this->tempDir.'/Server/.mod_state');
    expect($stateContent)
        ->toContain('Mods=Hydrocraft;ZomboidManager;NewMod')
        ->and($stateContent)->toContain('WorkshopItems=2286126274;3685323705;4242424242');
});

it('re-attaches the protected ZomboidManager mod when add() runs without it', function () {
    $this->parser->write($this->iniPath, ['Mods' => '', 'WorkshopItems' => '']);

    $this->manager->add($this->iniPath, '4242424242', 'SoloMod');

    $stateContent = file_get_contents($this->tempDir.'/Server/.mod_state');
    expect($stateContent)
        ->toContain('Mods=SoloMod;ZomboidManager')
        ->and($stateContent)->toContain('WorkshopItems=4242424242;3685323705');
});

it('does not duplicate ZomboidManager when reorder already contains it', function () {
    // Regression: PHP coerces numeric-string array keys (PROTECTED_MODS) to int,
    // and a naive in_array(..., $workshopIds, true) treats int 3685323705 and
    // "3685323705" as different — appending a duplicate every reorder call.
    $this->manager->reorder($this->iniPath, [
        ['workshop_id' => '3685323705', 'mod_id' => 'ZomboidManager'],
        ['workshop_id' => '2561774086', 'mod_id' => 'SuperSurvivors'],
        ['workshop_id' => '2286126274', 'mod_id' => 'Hydrocraft'],
    ]);

    $stateContent = file_get_contents($this->tempDir.'/Server/.mod_state');
    expect(substr_count($stateContent, 'ZomboidManager'))->toBe(1)
        ->and(substr_count($stateContent, '3685323705'))->toBe(1);
});

it('rolls back the INI when state file write fails', function () {
    $iniBefore = file_get_contents($this->iniPath);
    chmod($this->tempDir.'/Server', 0555);

    try {
        try {
            $this->manager->add($this->iniPath, '1111111111', 'TestMod');
        } catch (RuntimeException) {
            // expected
        }
    } finally {
        chmod($this->tempDir.'/Server', 0777);
    }

    expect(file_get_contents($this->iniPath))->toBe($iniBefore);
})->skip(getmyuid() === 0, 'chmod restrictions are bypassed by root');

it('marks all mods stopped when server is not running', function () {
    $result = $this->manager->listWithStatus($this->iniPath, serverRunning: false, workshopContentPath: $this->workshopContentPath);

    expect($result['server_running'])->toBeFalse()
        ->and($result['pending_restart'])->toBeFalse()
        ->and(collect($result['mods'])->pluck('status')->all())
        ->each->toBe('stopped');
});

it('marks mods active when state matches applied snapshot', function () {
    $this->manager->add($this->iniPath, '1111111111', 'TestMod');

    // Include the auto-attached ZomboidManager in the applied snapshot so the
    // user intent matches what the server last loaded.
    file_put_contents(
        $this->tempDir.'/Server/.mod_state_applied',
        "Mods=SuperSurvivors;Hydrocraft;TestMod;ZomboidManager\nWorkshopItems=2561774086;2286126274;1111111111;3685323705\n"
    );

    $result = $this->manager->listWithStatus($this->iniPath, serverRunning: true, workshopContentPath: $this->workshopContentPath);

    expect($result['pending_restart'])->toBeFalse()
        ->and(collect($result['mods'])->pluck('status')->all())
        ->each->toBe('active');
});

it('marks newly added mod as pending_restart when applied snapshot is older', function () {
    file_put_contents(
        $this->tempDir.'/Server/.mod_state_applied',
        "Mods=SuperSurvivors;Hydrocraft\nWorkshopItems=2561774086;2286126274\n"
    );

    $this->manager->add($this->iniPath, '1111111111', 'NewMod');

    $result = $this->manager->listWithStatus($this->iniPath, serverRunning: true, workshopContentPath: $this->workshopContentPath);

    expect($result['pending_restart'])->toBeTrue();

    $byId = collect($result['mods'])->keyBy('workshop_id');
    expect($byId['2561774086']['status'])->toBe('active')
        ->and($byId['2286126274']['status'])->toBe('active')
        ->and($byId['1111111111']['status'])->toBe('pending_restart');
});

it('flags pending_restart when a mod was removed since last server start', function () {
    file_put_contents(
        $this->tempDir.'/Server/.mod_state_applied',
        "Mods=SuperSurvivors;Hydrocraft\nWorkshopItems=2561774086;2286126274\n"
    );

    $this->manager->remove($this->iniPath, '2286126274');

    $result = $this->manager->listWithStatus($this->iniPath, serverRunning: true, workshopContentPath: $this->workshopContentPath);

    // After remove() the auto-attached ZomboidManager (3685323705) is in user intent
    // but not in .mod_state_applied — so it's correctly flagged pending_restart.
    expect($result['pending_restart'])->toBeTrue();

    $byId = collect($result['mods'])->keyBy('workshop_id');
    expect($byId['2561774086']['status'])->toBe('active')
        ->and($byId['3685323705']['status'])->toBe('pending_restart');
});

it('falls back to active when applied snapshot is missing on running server', function () {
    $result = $this->manager->listWithStatus($this->iniPath, serverRunning: true, workshopContentPath: $this->workshopContentPath);

    expect($result['pending_restart'])->toBeFalse()
        ->and($result['applied_snapshot_present'])->toBeFalse()
        ->and(collect($result['mods'])->pluck('status')->all())
        ->each->toBe('active');
});

it('persists Map to .config_state when adding a map mod', function () {
    $this->manager->add($this->iniPath, '9999999999', 'MapMod', 'CustomMap');

    expect(file_exists($this->configStatePath))->toBeTrue();
    expect(file_get_contents($this->configStatePath))->toContain('Map=')
        ->and(file_get_contents($this->configStatePath))->toContain('CustomMap');
});

it('persists Map to .config_state when removing a map mod', function () {
    $this->manager->add($this->iniPath, '9999999999', 'MapMod', 'CustomMap');
    $this->manager->remove($this->iniPath, '9999999999', 'CustomMap');

    expect(file_get_contents($this->configStatePath))->not->toContain('CustomMap');
});

it('does not touch .config_state when adding a mod without a map folder', function () {
    $this->manager->add($this->iniPath, '1111111111', 'TestMod');

    expect(file_exists($this->configStatePath))->toBeFalse();
});

it('bulk imports independent Mods and WorkshopItems lists, merging into existing', function () {
    // A real pack has more mods than workshop items (one item can provide many mods).
    $summary = $this->manager->bulkImport(
        $this->iniPath,
        ['1111111111', '2222222222'],
        ['ModA', 'ModB', 'ModC'],
    );

    expect($summary['workshop_added'])->toBe(2)
        ->and($summary['mods_added'])->toBe(3);

    $config = $this->parser->read($this->iniPath);
    expect($config['Mods'])->toBe('SuperSurvivors;Hydrocraft;ModA;ModB;ModC;ZomboidManager')
        ->and($config['WorkshopItems'])->toBe('2561774086;2286126274;1111111111;2222222222;3685323705');
});

it('bulk import merges each list independently and skips duplicates', function () {
    $summary = $this->manager->bulkImport(
        $this->iniPath,
        ['2561774086', '3333333333'],   // first already present
        ['SuperSurvivors', 'FreshMod'],  // first already present
    );

    expect($summary['workshop_added'])->toBe(1)
        ->and($summary['mods_added'])->toBe(1);

    $config = $this->parser->read($this->iniPath);
    expect(substr_count($config['WorkshopItems'], '2561774086'))->toBe(1)
        ->and(substr_count($config['Mods'], 'SuperSurvivors'))->toBe(1);
});

it('bulk import accepts mod IDs with spaces, brackets, ampersands and slashes', function () {
    // Regression: real B42 packs use mod IDs like these.
    $this->manager->bulkImport(
        $this->iniPath,
        [],
        ['[B42] Tatrapan', 'FWOBenchPress&Treadmill', '1299328280/ToadTraits'],
    );

    $mods = $this->parser->read($this->iniPath)['Mods'];
    expect($mods)->toContain('[B42] Tatrapan')
        ->and($mods)->toContain('FWOBenchPress&Treadmill')
        ->and($mods)->toContain('1299328280/ToadTraits');
});

it('bulk import writes .mod_state and re-attaches ZomboidManager', function () {
    $this->manager->bulkImport($this->iniPath, ['1111111111'], ['ModA']);

    $state = file_get_contents($this->tempDir.'/Server/.mod_state');
    expect($state)->toContain('Mods=SuperSurvivors;Hydrocraft;ModA;ZomboidManager')
        ->and($state)->toContain('WorkshopItems=2561774086;2286126274;1111111111;3685323705');
});

it('bulk import prepends new map folders before the vanilla map and persists them', function () {
    $summary = $this->manager->bulkImport(
        $this->iniPath,
        ['1111111111'],
        ['ModA'],
        ['BigMap', 'Muldraugh, KY'],
    );

    expect($summary['maps_added'])->toBe(1);

    // Mod maps must sit ahead of the vanilla base map in Map=.
    expect($this->parser->read($this->iniPath)['Map'])->toBe('BigMap;Muldraugh, KY');
    expect(file_get_contents($this->configStatePath))->toContain('Map=BigMap;Muldraugh, KY');
});

it('bulk import with only already-present mods and no maps writes nothing new', function () {
    unlink($this->tempDir.'/Server/.mod_state');

    $summary = $this->manager->bulkImport(
        $this->iniPath,
        ['2561774086'],
        ['SuperSurvivors', 'Hydrocraft'],
    );

    expect($summary['workshop_added'])->toBe(0)
        ->and($summary['mods_added'])->toBe(0)
        ->and(file_exists($this->tempDir.'/Server/.mod_state'))->toBeFalse();
});
