<?php

namespace App\Services;

use App\Models\WhitelistEntry;
use Illuminate\Support\Facades\DB;

class PzPasswordSyncService
{
    /**
     * Sync a plain-text password to PZ SQLite and update the tracked hash in PostgreSQL.
     */
    public function sync(string $username, string $plainPassword): void
    {
        $pzHash = PzAccountAuthenticator::hashForPz($plainPassword);

        $updated = DB::connection('pz_sqlite')
            ->table('whitelist')
            ->where('username', $username)
            ->update(['password' => $pzHash]);

        if ($updated !== 1) {
            throw new \RuntimeException("PZ account not found for {$username}");
        }

        WhitelistEntry::query()
            ->where('pz_username', $username)
            ->update([
                'pz_password_hash' => $pzHash,
                'synced_at' => now(),
            ]);
    }
}
