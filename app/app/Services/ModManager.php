<?php

namespace App\Services;

class ModManager
{
    /**
     * Mods that must remain installed for the manager to work, keyed by
     * Workshop ID with the corresponding `mod_id` as the value. The
     * proprietary ZomboidManager mod provides the Lua bridge used by
     * inventory, delivery, and player-position features — removing it
     * breaks core functionality, so the API/UI refuse to remove these
     * and write paths re-attach them automatically if they go missing.
     */
    public const PROTECTED_MODS = [
        '3685323705' => 'ZomboidManager',
    ];

    public function __construct(
        private readonly ServerIniParser $iniParser,
        private readonly ConfigStateManager $configState,
    ) {}

    public static function isProtected(string $workshopId): bool
    {
        return array_key_exists($workshopId, self::PROTECTED_MODS);
    }

    /**
     * Get the current mod list.
     *
     * Prefers `.mod_state` (the user's intended list, written by add/remove/reorder)
     * over the live INI, because PZ rewrites the INI on shutdown/startup and may
     * leave stale or empty Mods= entries between container restarts. Falls back to
     * the INI when the state file is missing or malformed.
     *
     * `Mods=` and `WorkshopItems=` are independent lists — a single Workshop item
     * can bundle several internal mod IDs (e.g. one Workshop upload containing
     * five sub-mods), so they're rarely the same length and must NOT be paired by
     * array position. When `$workshopContentPath` is given, each mod's Workshop ID
     * and declared dependencies are instead resolved by scanning the downloaded
     * Workshop content for the `mods/<ModName>/mod.info` that declares that mod ID
     * (and its `require=` line, if any). Without a path (or if a mod isn't found on
     * disk), its workshop_id is '' and it has no known requires.
     *
     * `required_by` is derived, not read from mod.info: it's every OTHER currently
     * enabled mod whose own `requires` names this one — used to warn against (or
     * block) removing a mod something else still depends on.
     *
     * @return array<int, array{workshop_id: string, mod_id: string, position: int, requires: list<string>, required_by: list<string>}>
     */
    public function list(string $iniPath, string $workshopContentPath = ''): array
    {
        $state = $this->parseStateFile(dirname($iniPath).'/.mod_state');

        $modIds = $state !== null
            ? $this->splitList($state['Mods'])
            : $this->splitList($this->iniParser->read($iniPath)['Mods'] ?? '');

        $index = $workshopContentPath !== ''
            ? $this->scanModIndex($workshopContentPath)
            : [];

        $mods = [];

        foreach ($modIds as $i => $modId) {
            $mods[] = [
                'workshop_id' => $index[$modId]['workshop_id'] ?? '',
                'mod_id' => $modId,
                'position' => $i,
                'requires' => $index[$modId]['requires'] ?? [],
            ];
        }

        foreach ($mods as $i => $mod) {
            $requiredBy = [];

            foreach ($mods as $other) {
                if ($other['mod_id'] !== $mod['mod_id'] && in_array($mod['mod_id'], $other['requires'], true)) {
                    $requiredBy[] = $other['mod_id'];
                }
            }

            $mods[$i]['required_by'] = $requiredBy;
        }

        return $mods;
    }

    /**
     * Look up which currently enabled mods declare needing `$modId` (via their
     * mod.info `require=` line) — used to block removing a mod others depend on.
     *
     * @return list<string>
     */
    public function findDependents(string $iniPath, string $workshopContentPath, string $modId): array
    {
        foreach ($this->list($iniPath, $workshopContentPath) as $mod) {
            if ($mod['mod_id'] === $modId) {
                return $mod['required_by'];
            }
        }

        return [];
    }

    /**
     * Build a mod_id → {workshop_id, requires} index from downloaded Workshop
     * content. Each Workshop item directory holds `mods/<ModName>/mod.info`
     * (sometimes one level deeper, e.g. `common/mod.info`) per internal mod it
     * bundles.
     *
     * @return array<string, array{workshop_id: string, requires: list<string>}>
     */
    private function scanModIndex(string $workshopContentPath): array
    {
        $index = [];

        foreach (glob($workshopContentPath.'/*', GLOB_ONLYDIR) ?: [] as $itemDir) {
            $workshopId = basename($itemDir);

            foreach (glob($itemDir.'/mods/*', GLOB_ONLYDIR) ?: [] as $modDir) {
                $info = $this->readModInfo($modDir);

                if ($info !== null) {
                    $index[$info['id']] = [
                        'workshop_id' => $workshopId,
                        'requires' => $info['requires'],
                    ];
                }
            }
        }

        return $index;
    }

    /**
     * Read the `id=` and `require=` lines from a mod's `mod.info`, checking the
     * mod directory itself and one level down (build-specific copies live in
     * subfolders like `common/` or `42/`, but all copies for a given mod share
     * the same id/requires).
     *
     * @return array{id: string, requires: list<string>}|null
     */
    private function readModInfo(string $modDir): ?array
    {
        $candidates = array_merge(
            glob($modDir.'/mod.info') ?: [],
            glob($modDir.'/*/mod.info') ?: [],
        );

        foreach ($candidates as $file) {
            $contents = @file_get_contents($file);

            if ($contents === false || ! preg_match('/^id=(.+)$/m', $contents, $idMatch)) {
                continue;
            }

            $requires = [];

            if (preg_match('/^require=(.+)$/m', $contents, $reqMatch)) {
                foreach (explode(',', $reqMatch[1]) as $dep) {
                    // Some mod.info files have a stray leading backslash on the
                    // dependency name (real-world formatting quirk) — strip it.
                    $dep = trim($dep, " \t\n\r\0\x0B\\");
                    if ($dep !== '') {
                        $requires[] = $dep;
                    }
                }
            }

            return ['id' => trim($idMatch[1]), 'requires' => $requires];
        }

        return null;
    }

    /**
     * Get the mod list with per-mod load status.
     *
     * Compares `.mod_state` (user intent) against `.mod_state_applied` (the
     * snapshot configure-server.sh wrote when PZ last started) to decide whether
     * each mod is actively running, awaiting a restart, or whether the server is
     * stopped.
     *
     * Statuses:
     *  - 'stopped'         — game server is not running; load state unknown
     *  - 'pending_restart' — mod is in user intent but not in the running config
     *  - 'active'          — mod is in user intent and was applied at last start
     *
     * When `.mod_state_applied` is missing (legacy containers from before this
     * file was written), every mod returned by `list()` is treated as 'active' if
     * the server is running — we can't know what changed since startup without
     * the snapshot.
     *
     * @return array{
     *     mods: array<int, array{workshop_id: string, mod_id: string, position: int, requires: list<string>, required_by: list<string>, status: string}>,
     *     pending_restart: bool,
     *     server_running: bool,
     *     applied_snapshot_present: bool,
     * }
     */
    public function listWithStatus(string $iniPath, bool $serverRunning, string $workshopContentPath = ''): array
    {
        $mods = $this->list($iniPath, $workshopContentPath);
        $applied = $this->parseStateFile(dirname($iniPath).'/.mod_state_applied');
        $appliedWorkshopIds = $applied !== null
            ? $this->splitList($applied['WorkshopItems'])
            : null;

        $pendingRestart = false;

        foreach ($mods as $i => $mod) {
            if (! $serverRunning) {
                $status = 'stopped';
            } elseif ($appliedWorkshopIds === null) {
                $status = 'active';
            } elseif (in_array($mod['workshop_id'], $appliedWorkshopIds, true)) {
                $status = 'active';
            } else {
                $status = 'pending_restart';
                $pendingRestart = true;
            }

            $mods[$i]['status'] = $status;
        }

        if ($serverRunning && $applied !== null) {
            $intentWorkshopIds = array_column($mods, 'workshop_id');
            $removedSinceStart = array_diff($appliedWorkshopIds, $intentWorkshopIds);
            if (! empty($removedSinceStart)) {
                $pendingRestart = true;
            }
        }

        return [
            'mods' => $mods,
            'pending_restart' => $pendingRestart,
            'server_running' => $serverRunning,
            'applied_snapshot_present' => $applied !== null,
        ];
    }

    /**
     * Parse `.mod_state` into its Mods/WorkshopItems values.
     *
     * Returns null when the file is absent, unreadable, or missing either expected
     * line — partial state is rejected so a corrupted file falls back to the INI
     * via the caller, rather than half-trusting it.
     *
     * @return array{Mods: string, WorkshopItems: string}|null
     */
    private function parseStateFile(string $stateFile): ?array
    {
        if (! is_readable($stateFile)) {
            return null;
        }

        $contents = @file_get_contents($stateFile);

        if ($contents === false) {
            return null;
        }

        if (! preg_match('/^Mods=(.*)$/m', $contents, $modsMatch)
            || ! preg_match('/^WorkshopItems=(.*)$/m', $contents, $workshopMatch)) {
            return null;
        }

        return [
            'Mods' => trim($modsMatch[1]),
            'WorkshopItems' => trim($workshopMatch[1]),
        ];
    }

    /**
     * Add a mod to both WorkshopItems and Mods lines.
     */
    public function add(string $iniPath, string $workshopId, string $modId, ?string $mapFolder = null): void
    {
        $current = $this->readCurrentLists($iniPath);
        $workshopIds = $current['workshop_ids'];
        $modIds = $current['mod_ids'];

        if (in_array($workshopId, $workshopIds, true)) {
            return;
        }

        $workshopIds[] = $workshopId;
        $modIds[] = $modId;

        $updates = [
            'WorkshopItems' => implode(';', $workshopIds),
            'Mods' => implode(';', $modIds),
        ];

        if ($mapFolder !== null) {
            $config = $this->iniParser->read($iniPath);
            $maps = $this->splitList($config['Map'] ?? 'Muldraugh, KY', ';');
            if (! in_array($mapFolder, $maps, true)) {
                $maps[] = $mapFolder;
                $updates['Map'] = implode(';', $maps);
            }
        }

        $this->writeIniAndState($iniPath, $updates);
    }

    /**
     * Remove a mod from the Mods/WorkshopItems lines.
     *
     * A single Workshop item can bundle several internal mod IDs — production
     * data confirms `WorkshopItems=` then lists that item once while `Mods=`
     * lists every mod it bundles, so the two are not index-aligned. Pass
     * `$modId` to remove by that unique key: only the matching `Mods=` entry
     * is spliced, and `WorkshopItems=` is left untouched, since correctly
     * pruning it would require knowing whether another remaining mod still
     * needs that same Workshop item (see `list()`'s mod.info scan — safe to
     * wire up later, not needed for removal to work correctly today).
     * Without `$modId`, the legacy behavior applies: the first entry matching
     * `$workshopId` is removed from both lists by position, which is correct
     * whenever that Workshop item only bundles one mod.
     *
     * @return array{workshop_id: string, mod_id: string}|null The removed mod, or null if not found.
     */
    public function remove(string $iniPath, string $workshopId, ?string $mapFolder = null, ?string $modId = null): ?array
    {
        $current = $this->readCurrentLists($iniPath);
        $workshopIds = $current['workshop_ids'];
        $modIds = $current['mod_ids'];

        if ($modId !== null) {
            $index = array_search($modId, $modIds, true);

            if ($index === false) {
                return null;
            }

            $removed = ['workshop_id' => $workshopId, 'mod_id' => $modIds[$index]];
            array_splice($modIds, $index, 1);
            $updates = ['Mods' => implode(';', $modIds)];
        } else {
            $index = array_search($workshopId, $workshopIds, true);

            if ($index === false) {
                return null;
            }

            $removed = [
                'workshop_id' => $workshopIds[$index],
                'mod_id' => $modIds[$index] ?? '',
            ];

            array_splice($workshopIds, $index, 1);
            array_splice($modIds, $index, 1);

            $updates = [
                'WorkshopItems' => implode(';', $workshopIds),
                'Mods' => implode(';', $modIds),
            ];
        }

        if ($mapFolder !== null) {
            $config = $this->iniParser->read($iniPath);
            $maps = $this->splitList($config['Map'] ?? '', ';');
            $maps = array_filter($maps, fn ($m) => $m !== $mapFolder);
            $updates['Map'] = implode(';', array_values($maps));
        }

        $this->writeIniAndState($iniPath, $updates);

        return $removed;
    }

    /**
     * Reorder mods by replacing both lines with the given ordered list.
     *
     * @param  array<int, array{workshop_id: string, mod_id: string}>  $orderedMods
     */
    public function reorder(string $iniPath, array $orderedMods): void
    {
        $workshopIds = array_column($orderedMods, 'workshop_id');
        $modIds = array_column($orderedMods, 'mod_id');

        $existing = $this->readCurrentLists($iniPath)['workshop_ids'];
        foreach (array_keys(self::PROTECTED_MODS) as $required) {
            // Cast: PHP coerces numeric-string array keys to int; compare as strings.
            $requiredStr = (string) $required;
            if (in_array($requiredStr, $existing, true) && ! in_array($requiredStr, $workshopIds, true)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'mods' => ["Reorder cannot drop required mod {$requiredStr}."],
                ]);
            }
        }

        $this->writeIniAndState($iniPath, [
            'WorkshopItems' => implode(';', $workshopIds),
            'Mods' => implode(';', $modIds),
        ]);
    }

    /**
     * Merge a pasted modpack into the current config in one write.
     *
     * PZ treats `Mods=`, `WorkshopItems=`, and `Map=` as three INDEPENDENT ordered
     * lists — a single Workshop item can provide several mod IDs, and some mods have
     * no Workshop ID at all, so the counts routinely differ (a 122-item pack can have
     * 265 mods). Each list is therefore merged on its own: new entries are appended in
     * the order given, existing ones are left untouched (never removed), and duplicates
     * are skipped. Map folders are prepended so modded maps sit ahead of the vanilla
     * base map (PZ resolves overlapping cells in list order, vanilla last).
     *
     * Everything is written through `writeIniAndState`, so the merged lists land in
     * `.mod_state` (authoritative across reboots), ZomboidManager is re-attached, and
     * any Map change is persisted to `.config_state`.
     *
     * @param  list<string>  $workshopIds
     * @param  list<string>  $modIds
     * @param  list<string>  $mapFolders
     * @return array{workshop_added: int, mods_added: int, maps_added: int}
     */
    public function bulkImport(string $iniPath, array $workshopIds, array $modIds, array $mapFolders = []): array
    {
        $current = $this->readCurrentLists($iniPath);

        [$mergedWorkshop, $workshopAdded] = $this->mergeList($current['workshop_ids'], $workshopIds);
        [$mergedMods, $modsAdded] = $this->mergeList($current['mod_ids'], $modIds);

        $updates = [
            'WorkshopItems' => implode(';', $mergedWorkshop),
            'Mods' => implode(';', $mergedMods),
        ];

        $newMapFolders = [];

        if ($mapFolders !== []) {
            $maps = $this->splitList($this->iniParser->read($iniPath)['Map'] ?? 'Muldraugh, KY', ';');
            $mapSet = array_flip($maps);

            foreach ($mapFolders as $folder) {
                $folder = trim((string) $folder);
                if ($folder === '' || isset($mapSet[$folder])) {
                    continue;
                }
                $mapSet[$folder] = true;
                $newMapFolders[] = $folder;
            }

            if ($newMapFolders !== []) {
                $updates['Map'] = implode(';', array_merge($newMapFolders, $maps));
            }
        }

        if ($workshopAdded === 0 && $modsAdded === 0 && $newMapFolders === []) {
            return ['workshop_added' => 0, 'mods_added' => 0, 'maps_added' => 0];
        }

        $this->writeIniAndState($iniPath, $updates);

        return [
            'workshop_added' => $workshopAdded,
            'mods_added' => $modsAdded,
            'maps_added' => count($newMapFolders),
        ];
    }

    /**
     * Append trimmed, non-empty, not-yet-present items to $current, preserving order.
     *
     * @param  list<string>  $current
     * @param  list<string>  $incoming
     * @return array{0: list<string>, 1: int} The merged list and the number added.
     */
    private function mergeList(array $current, array $incoming): array
    {
        $seen = array_flip($current);
        $added = 0;

        foreach ($incoming as $item) {
            $item = trim((string) $item);
            if ($item === '' || isset($seen[$item])) {
                continue;
            }
            $seen[$item] = true;
            $current[] = $item;
            $added++;
        }

        return [$current, $added];
    }

    /**
     * Read the current Workshop/Mods lists used by `add`, `remove`, and `reorder`.
     *
     * Prefers `.mod_state` (the web-UI's source of truth) over the live INI,
     * because PZ rewrites the INI on shutdown and may prune entries it didn't
     * load. Without this preference, an `add()` call performed while the INI
     * was pruned would silently drop every previously-installed mod.
     *
     * @return array{workshop_ids: list<string>, mod_ids: list<string>}
     */
    private function readCurrentLists(string $iniPath): array
    {
        $state = $this->parseStateFile(dirname($iniPath).'/.mod_state');

        if ($state !== null) {
            return [
                'workshop_ids' => $this->splitList($state['WorkshopItems']),
                'mod_ids' => $this->splitList($state['Mods']),
            ];
        }

        $config = $this->iniParser->read($iniPath);

        return [
            'workshop_ids' => $this->splitList($config['WorkshopItems'] ?? ''),
            'mod_ids' => $this->splitList($config['Mods'] ?? ''),
        ];
    }

    /**
     * Re-attach any protected mods that are absent from the given lists.
     * Mutates both arrays in-place. The protected mod is appended at the
     * end so the user's ordering of optional mods is preserved.
     *
     * @param  list<string>  $workshopIds
     * @param  list<string>  $modIds
     */
    private function ensureProtectedMods(array &$workshopIds, array &$modIds): void
    {
        foreach (self::PROTECTED_MODS as $workshopId => $modId) {
            // PHP coerces numeric string array keys to int, so cast back before
            // comparing against the string Workshop IDs we get from splitList.
            // Without the cast, in_array with strict=true treats int 3685323705
            // and "3685323705" as different and appends a duplicate every write.
            $workshopIdStr = (string) $workshopId;
            if (in_array($workshopIdStr, $workshopIds, true)) {
                continue;
            }
            $workshopIds[] = $workshopIdStr;
            $modIds[] = $modId;
        }
    }

    /**
     * Apply INI updates and write the mod state snapshot atomically. If the
     * state-file write fails, the prior INI content is restored so callers see
     * an all-or-nothing outcome rather than a partially-applied change.
     *
     * @param  array<string, string>  $updates
     */
    private function writeIniAndState(string $iniPath, array $updates): void
    {
        if (isset($updates['WorkshopItems']) && isset($updates['Mods'])) {
            $workshopIds = $this->splitList($updates['WorkshopItems']);
            $modIds = $this->splitList($updates['Mods']);
            $this->ensureProtectedMods($workshopIds, $modIds);
            $updates['WorkshopItems'] = implode(';', $workshopIds);
            $updates['Mods'] = implode(';', $modIds);
        }

        $previousIni = @file_get_contents($iniPath);

        $this->iniParser->write($iniPath, $updates);

        try {
            $this->writeModState($iniPath);
        } catch (\Throwable $e) {
            if ($previousIni !== false) {
                @file_put_contents($iniPath, $previousIni);
            }
            throw $e;
        }

        // Modded maps append their folder to the INI Map= line, but configure-server.sh
        // rewrites Map= from .config_state on every boot. Persist the change there too,
        // otherwise the modded map folder is dropped on the next container restart while
        // the map's mod survives (via .mod_state). Only Map goes through here — Mods and
        // WorkshopItems are restored from .mod_state, not .config_state.
        if (array_key_exists('Map', $updates)) {
            $this->configState->persistSettings(['Map' => $updates['Map']], $iniPath);
        }
    }

    /**
     * Write a mod state snapshot to the shared volume.
     *
     * This file is read by configure-server.sh on container restart
     * to restore web-UI mod changes that would otherwise be overwritten
     * by the game server image's own configuration logic.
     */
    private function writeModState(string $iniPath): void
    {
        $config = $this->iniParser->read($iniPath);

        $mods = str_replace(["\n", "\r"], '', $config['Mods'] ?? '');
        $workshopItems = str_replace(["\n", "\r"], '', $config['WorkshopItems'] ?? '');

        $stateFile = dirname($iniPath).'/.mod_state';
        $stateDir = dirname($stateFile);
        $contents = "Mods=$mods\nWorkshopItems=$workshopItems\n";
        $tempFile = @tempnam($stateDir, '.mod_state.');

        if (
            $tempFile === false
            || realpath(dirname($tempFile)) !== realpath($stateDir)
        ) {
            if ($tempFile !== false) {
                @unlink($tempFile);
            }
            throw new \RuntimeException("Unable to create temporary mod state file in {$stateDir}.");
        }

        try {
            if (@file_put_contents($tempFile, $contents) === false) {
                throw new \RuntimeException("Unable to write temporary mod state file {$tempFile}.");
            }

            if (! @rename($tempFile, $stateFile)) {
                throw new \RuntimeException("Unable to atomically replace mod state file {$stateFile}.");
            }

            @chmod($stateFile, 0644);
        } finally {
            if (is_file($tempFile)) {
                @unlink($tempFile);
            }
        }
    }

    /**
     * @return string[]
     */
    private function splitList(string $value, string $separator = ';'): array
    {
        if ($value === '') {
            return [];
        }

        return array_values(array_filter(
            array_map('trim', explode($separator, $value)),
            fn ($v) => $v !== '',
        ));
    }
}
