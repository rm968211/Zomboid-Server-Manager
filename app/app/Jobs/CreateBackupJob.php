<?php

namespace App\Jobs;

use App\Enums\BackupStatus;
use App\Enums\BackupType;
use App\Models\Backup;
use App\Services\AuditLogger;
use App\Services\BackupManager;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class CreateBackupJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 300;

    public function __construct(
        private readonly BackupType $type,
        private readonly ?string $notes = null,
        private readonly ?string $actor = null,
        private readonly ?string $ip = null,
        private readonly ?string $backupId = null,
    ) {}

    public function handle(BackupManager $backupManager): void
    {
        $record = $this->backupId ? Backup::find($this->backupId) : null;

        $record ??= $backupManager->startBackupRecord($this->type, $this->notes);

        $result = $backupManager->createBackup($this->type, $this->notes, $record);

        $backup = $result['backup'];

        AuditLogger::record(
            actor: $this->actor ?? 'system',
            action: 'backup.created',
            target: $backup->filename,
            details: [
                'type' => $this->type->value,
                'size_bytes' => $backup->size_bytes,
                'cleanup_count' => $result['cleanup_count'],
                'source' => $this->actor ? 'manual' : 'scheduled_job',
            ],
            ip: $this->ip,
        );

        Log::info('Backup completed', [
            'filename' => $backup->filename,
            'type' => $this->type->value,
            'size_bytes' => $backup->size_bytes,
            'actor' => $this->actor ?? 'system',
        ]);
    }

    /**
     * Mark the pending record failed when the job dies before/outside
     * createBackup's own failure handling (e.g. timeout kill).
     */
    public function failed(?\Throwable $exception): void
    {
        $record = $this->backupId ? Backup::find($this->backupId) : null;

        if ($record && $record->status === BackupStatus::InProgress) {
            $record->update([
                'status' => BackupStatus::Failed,
                'error_message' => $exception?->getMessage() ?? 'Backup job failed unexpectedly.',
            ]);
        }

        AuditLogger::record(
            actor: $this->actor ?? 'system',
            action: 'backup.failed',
            target: $record->filename ?? $this->type->value,
            details: [
                'type' => $this->type->value,
                'error' => $exception?->getMessage(),
            ],
            ip: $this->ip,
        );
    }
}
