<?php

use App\Enums\BackupType;
use App\Jobs\CreateBackupJob;
use Illuminate\Support\Facades\Schedule;

Schedule::job(new CreateBackupJob(BackupType::Scheduled))
    ->everyFourHours()
    ->when(function () {
        try {
            return cache()->get('backup.schedule.hourly_enabled', true);
        } catch (\Throwable) {
            return true;
        }
    });

Schedule::command('pz:sync-accounts')->everyFiveMinutes();

Schedule::command('zomboid:sync-player-stats')->everyTenMinutes();

Schedule::command('zomboid:auto-restart-check')->everyMinute();

Schedule::command('zomboid:import-pvp-violations')->everyFiveMinutes();

Schedule::command('zomboid:import-pvp-kills')->everyFiveMinutes();

Schedule::command('zomboid:process-respawn-kicks')->everyFiveMinutes();

Schedule::command('zomboid:parse-game-events')->everyFiveMinutes();

Schedule::command('zomboid:process-shop-deliveries')->everyMinute();

Schedule::command('zomboid:process-money-deposits')->everyMinute();

Schedule::command('zomboid:generate-map-tiles')
    ->everyThirtyMinutes()
    ->withoutOverlapping(720)
    ->when(function () {
        if (app(\App\Services\MapConfigBuilder::class)->hasLocalTiles()) {
            return false;
        }

        // Keep retrying transient states ('waiting', missing file), but not a
        // failed render — that error is surfaced in the UI for manual action.
        $status = @json_decode((string) @file_get_contents(config('zomboid.map.status_path')), true);

        return ($status['status'] ?? null) !== 'failed';
    })
    ->runInBackground();

Schedule::command('zomboid:download-item-icons')
    ->hourly()
    ->when(function () {
        $catalog = config('zomboid.lua_bridge.items_catalog');

        return file_exists($catalog) && ! glob(public_path('images/items/*.png'));
    })
    ->runInBackground();

Schedule::job(new CreateBackupJob(BackupType::Daily))
    ->dailyAt('04:00')
    ->when(function () {
        try {
            return cache()->get('backup.schedule.daily_enabled', true);
        } catch (\Throwable) {
            return true;
        }
    });
