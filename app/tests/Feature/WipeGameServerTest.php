<?php

use App\Enums\BackupType;
use App\Jobs\WipeGameServer;
use App\Services\BackupManager;
use App\Services\DockerManager;
use App\Services\RconClient;

it('aborts a wipe when the safety backup fails', function () {
    $backup = Mockery::mock(BackupManager::class);
    $backup->shouldReceive('createBackup')
        ->once()
        ->with(BackupType::PreRollback, 'Pre-wipe safety backup')
        ->andThrow(new RuntimeException('backup failed'));

    $rcon = Mockery::mock(RconClient::class);
    $rcon->shouldNotReceive('connect');

    $docker = Mockery::mock(DockerManager::class);
    $docker->shouldNotReceive('stopContainer');
    $docker->shouldNotReceive('startContainer');

    $job = new WipeGameServer('127.0.0.1');

    expect(fn () => $job->handle($rcon, $docker, $backup))
        ->toThrow(RuntimeException::class, 'backup failed');
});
