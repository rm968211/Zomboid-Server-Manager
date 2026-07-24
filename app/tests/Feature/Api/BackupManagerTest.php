<?php

use App\Enums\BackupType;
use App\Models\Backup;
use App\Services\BackupManager;
use App\Services\RconClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Process;

uses(RefreshDatabase::class);

function mockRconForBackup(): void
{
    $rcon = Mockery::mock(RconClient::class);
    $rcon->shouldReceive('connect')->andReturn(true);
    $rcon->shouldReceive('command')->with('save')->andReturn('World saved');
    app()->instance(RconClient::class, $rcon);
}

function mockRconOfflineForBackup(): void
{
    $rcon = Mockery::mock(RconClient::class);
    $rcon->shouldReceive('connect')->andThrow(new RuntimeException('Connection refused'));
    app()->instance(RconClient::class, $rcon);
}

function setupBackupDirs(): array
{
    $dataDir = sys_get_temp_dir().'/pz_test_data_'.uniqid();
    $backupDir = sys_get_temp_dir().'/pz_test_backups_'.uniqid();

    mkdir($dataDir.'/Server', 0755, true);
    mkdir($dataDir.'/Saves', 0755, true);
    mkdir($dataDir.'/db', 0755, true);

    file_put_contents($dataDir.'/Server/test.ini', 'MaxPlayers=16');
    file_put_contents($dataDir.'/Saves/test.txt', 'save data');
    file_put_contents($dataDir.'/db/serverPZ.db', 'db data');

    config(['zomboid.paths.data' => $dataDir]);
    config(['zomboid.backups.path' => $backupDir]);

    return ['data' => $dataDir, 'backup' => $backupDir];
}

function cleanupDirs(array $dirs): void
{
    foreach ($dirs as $dir) {
        if (is_dir($dir)) {
            exec('rm -rf '.escapeshellarg($dir));
        }
    }
}

// ── Backup Creation ──────────────────────────────────────────────────

it('creates a backup archive', function () {
    Process::fake([
        '*' => Process::result(output: '', exitCode: 0),
    ]);
    $dirs = setupBackupDirs();
    mockRconForBackup();

    try {
        $manager = app(BackupManager::class);
        $result = $manager->createBackup(BackupType::Manual, 'Test backup');

        expect($result['backup'])->toBeInstanceOf(Backup::class)
            ->and($result['backup']->type)->toBe(BackupType::Manual)
            ->and($result['backup']->notes)->toBe('Test backup')
            ->and($result['backup']->filename)->toStartWith('backup_manual_')
            ->and($result['backup']->filename)->toEndWith('.tar.gz')
            ->and($result['cleanup_count'])->toBe(0);

        expect(Backup::count())->toBe(1);
    } finally {
        cleanupDirs($dirs);
    }
});

it('creates backup when rcon is offline', function () {
    Process::fake([
        '*' => Process::result(output: '', exitCode: 0),
    ]);
    $dirs = setupBackupDirs();
    mockRconOfflineForBackup();

    try {
        $manager = app(BackupManager::class);
        $result = $manager->createBackup(BackupType::Manual);

        expect($result['backup'])->toBeInstanceOf(Backup::class)
            ->and(Backup::count())->toBe(1);
    } finally {
        cleanupDirs($dirs);
    }
});

it('creates backup with correct type classification', function (string $typeValue, string $expectedPrefix) {
    $type = BackupType::from($typeValue);
    Process::fake([
        '*' => Process::result(output: '', exitCode: 0),
    ]);
    $dirs = setupBackupDirs();
    mockRconForBackup();

    try {
        $manager = app(BackupManager::class);
        $result = $manager->createBackup($type);

        expect($result['backup']->type)->toBe($type)
            ->and($result['backup']->filename)->toStartWith($expectedPrefix);
    } finally {
        cleanupDirs($dirs);
    }
})->with([
    ['manual', 'backup_manual_'],
    ['scheduled', 'backup_scheduled_'],
    ['daily', 'backup_daily_'],
    ['pre_rollback', 'backup_pre_rollback_'],
    ['pre_update', 'backup_pre_update_'],
]);

// ── Retention Cleanup ────────────────────────────────────────────────

it('enforces retention policy', function () {
    config(['zomboid.backups.retention.manual' => 3]);

    Backup::factory()->manual()->count(5)->create();
    expect(Backup::count())->toBe(5);

    Process::fake([
        '*' => Process::result(output: '', exitCode: 0),
    ]);
    $dirs = setupBackupDirs();
    mockRconForBackup();

    try {
        $manager = app(BackupManager::class);
        $deleted = $manager->cleanupRetention(BackupType::Manual);

        expect($deleted)->toBe(2)
            ->and(Backup::where('type', 'manual')->count())->toBe(3);
    } finally {
        cleanupDirs($dirs);
    }
});

it('does not delete when under retention limit', function () {
    config(['zomboid.backups.retention.scheduled' => 10]);

    Backup::factory()->scheduled()->count(3)->create();

    $manager = app(BackupManager::class);
    $deleted = $manager->cleanupRetention(BackupType::Scheduled);

    expect($deleted)->toBe(0)
        ->and(Backup::count())->toBe(3);
});

// ── Backup Deletion ─────────────────────────────────────────────────

it('deletes backup file and record', function () {
    $tmpFile = tempnam(sys_get_temp_dir(), 'pz_backup_');
    file_put_contents($tmpFile, 'test backup data');

    $backup = Backup::factory()->create([
        'path' => $tmpFile,
        'filename' => basename($tmpFile),
    ]);

    $manager = app(BackupManager::class);
    $result = $manager->deleteBackup($backup);

    expect($result)->toBeTrue()
        ->and(file_exists($tmpFile))->toBeFalse()
        ->and(Backup::count())->toBe(0);
});

it('deletes record even when file is already missing', function () {
    $backup = Backup::factory()->create([
        'path' => '/tmp/nonexistent_backup.tar.gz',
    ]);

    $manager = app(BackupManager::class);
    $result = $manager->deleteBackup($backup);

    expect($result)->toBeTrue()
        ->and(Backup::count())->toBe(0);
});

// ── Data Directory ──────────────────────────────────────────────────

it('throws when pz data directory is missing', function () {
    Process::fake();
    config(['zomboid.paths.data' => '/nonexistent/pz/data']);
    config(['zomboid.backups.path' => sys_get_temp_dir().'/pz_test_backups_'.uniqid()]);
    mockRconForBackup();

    $manager = app(BackupManager::class);
    $manager->createBackup(BackupType::Manual);
})->throws(RuntimeException::class, 'PZ data directory not found');

// ── Status Tracking ─────────────────────────────────────────────────

it('marks a completed backup record completed', function () {
    Process::fake([
        '*' => Process::result(output: '', exitCode: 0),
    ]);
    $dirs = setupBackupDirs();
    mockRconOfflineForBackup();

    try {
        $result = app(BackupManager::class)->createBackup(BackupType::Manual);

        expect($result['backup']->status)->toBe(\App\Enums\BackupStatus::Completed);
    } finally {
        cleanupDirs($dirs);
    }
});

it('updates a pre-created record instead of creating a new one', function () {
    Process::fake([
        '*' => Process::result(output: '', exitCode: 0),
    ]);
    $dirs = setupBackupDirs();
    mockRconOfflineForBackup();

    try {
        $manager = app(BackupManager::class);
        $record = $manager->startBackupRecord(BackupType::Manual, 'pending');

        expect($record->status)->toBe(\App\Enums\BackupStatus::InProgress);

        $result = $manager->createBackup(BackupType::Manual, 'pending', $record);

        expect(Backup::count())->toBe(1)
            ->and($result['backup']->id)->toBe($record->id)
            ->and($result['backup']->status)->toBe(\App\Enums\BackupStatus::Completed);
    } finally {
        cleanupDirs($dirs);
    }
});

it('marks the backup record failed when archive creation fails', function () {
    Process::fake([
        '*' => Process::result(output: '', errorOutput: 'tar: disk full', exitCode: 2),
    ]);
    $dirs = setupBackupDirs();
    mockRconOfflineForBackup();

    try {
        $manager = app(BackupManager::class);

        expect(fn () => $manager->createBackup(BackupType::Manual))
            ->toThrow(RuntimeException::class);

        $backup = Backup::first();
        expect($backup->status)->toBe(\App\Enums\BackupStatus::Failed)
            ->and($backup->error_message)->toContain('disk full');
    } finally {
        cleanupDirs($dirs);
    }
});

it('marks the record failed when the queued job fails', function () {
    $backup = Backup::factory()->create(['status' => 'in_progress']);

    $job = new \App\Jobs\CreateBackupJob(BackupType::Manual, null, 'admin', null, $backup->id);
    $job->failed(new RuntimeException('worker killed'));

    $backup->refresh();
    expect($backup->status)->toBe(\App\Enums\BackupStatus::Failed)
        ->and($backup->error_message)->toBe('worker killed');
});

it('excludes non-completed backups from retention cleanup', function () {
    config(['zomboid.backups.retention.manual' => 1]);

    Backup::factory()->create(['type' => 'manual', 'status' => 'failed', 'created_at' => now()->subDays(3)]);
    $oldCompleted = Backup::factory()->create(['type' => 'manual', 'status' => 'completed', 'created_at' => now()->subDays(2), 'path' => '/nonexistent']);
    Backup::factory()->create(['type' => 'manual', 'status' => 'completed', 'created_at' => now(), 'path' => '/nonexistent']);

    $deleted = app(BackupManager::class)->cleanupRetention(BackupType::Manual);

    expect($deleted)->toBe(1)
        ->and(Backup::find($oldCompleted->id))->toBeNull()
        ->and(Backup::where('status', 'failed')->count())->toBe(1);
});

it('refuses to roll back a non-completed backup', function () {
    $backup = Backup::factory()->create(['status' => 'failed']);

    app(BackupManager::class)->validateBackupFile($backup);
})->throws(RuntimeException::class, 'cannot be restored');
