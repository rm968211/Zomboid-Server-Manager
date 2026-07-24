<?php

use Illuminate\Filesystem\Filesystem;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;

beforeEach(function () {
    $this->mapGenerationRoot = sys_get_temp_dir().'/map-generation-test-'.uniqid();
    $this->serverPath = $this->mapGenerationRoot.'/server';
    $this->tilesPath = $this->mapGenerationRoot.'/tiles';
    $this->statusPath = $this->mapGenerationRoot.'/status.json';
    $this->pzmapPath = $this->mapGenerationRoot.'/pzmap2dzi/main.py';

    mkdir($this->serverPath.'/media', 0755, true);
    mkdir(dirname($this->pzmapPath).'/conf', 0755, true);
    file_put_contents($this->pzmapPath, '');

    config([
        'zomboid.game_server_path' => $this->serverPath,
        'zomboid.map.tiles_path' => $this->tilesPath,
        'zomboid.map.status_path' => $this->statusPath,
        'zomboid.map.generation_timeout' => 28800,
    ]);
});

afterEach(function () {
    (new Filesystem)->deleteDirectory($this->mapGenerationRoot);
});

it('uses a high wall-clock timeout for map rendering', function () {
    Process::fake(function (PendingProcess $process) {
        if ($process->command === ['python3', '--version']) {
            return Process::result(output: 'Python 3.13.0');
        }

        if ($process->command === ['which', 'pzmap2dzi']) {
            return Process::result(output: $this->pzmapPath.PHP_EOL);
        }

        return Process::result();
    });

    $this->artisan('zomboid:generate-map-tiles', [
        '--force' => true,
        '--workers' => 1,
    ])->assertSuccessful();

    Process::assertRan(fn (PendingProcess $process) => $process->timeout === 28800
        && is_array($process->command)
        && in_array('render', $process->command, true));

    $status = json_decode(file_get_contents($this->statusPath), true);

    expect($status)
        ->status->toBe('success')
        ->stage->toBe('complete')
        ->started_at->not->toBeNull();
});

it('records unexpected renderer exceptions as failed', function () {
    Process::fake(function (PendingProcess $process) {
        if ($process->command === ['python3', '--version']) {
            return Process::result(output: 'Python 3.13.0');
        }

        if ($process->command === ['which', 'pzmap2dzi']) {
            return Process::result(output: $this->pzmapPath.PHP_EOL);
        }

        if (is_array($process->command) && in_array('render', $process->command, true)) {
            return new RuntimeException('renderer crashed');
        }

        return Process::result();
    });

    $this->artisan('zomboid:generate-map-tiles', [
        '--force' => true,
        '--workers' => 1,
    ])->assertFailed();

    $status = json_decode(file_get_contents($this->statusPath), true);

    expect($status)
        ->status->toBe('failed')
        ->stage->toBe('failed')
        ->error->toContain('renderer crashed')
        ->started_at->not->toBeNull();
});
