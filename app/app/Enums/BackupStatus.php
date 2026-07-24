<?php

namespace App\Enums;

enum BackupStatus: string
{
    case InProgress = 'in_progress';
    case Completed = 'completed';
    case Failed = 'failed';
}
