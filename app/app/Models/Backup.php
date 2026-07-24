<?php

namespace App\Models;

use App\Enums\BackupStatus;
use App\Enums\BackupType;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Backup extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $attributes = [
        'status' => 'completed',
    ];

    protected $fillable = [
        'filename',
        'path',
        'size_bytes',
        'type',
        'game_version',
        'steam_branch',
        'notes',
        'status',
        'error_message',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'type' => BackupType::class,
            'status' => BackupStatus::class,
            'size_bytes' => 'integer',
            'created_at' => 'datetime',
        ];
    }
}
