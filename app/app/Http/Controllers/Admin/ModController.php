<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AddWishlistModRequest;
use App\Http\Requests\Admin\ImportModsRequest;
use App\Http\Requests\Admin\ImportWishlistRequest;
use App\Http\Requests\Admin\LookupWorkshopModRequest;
use App\Http\Requests\Admin\ModDetailsRequest;
use App\Http\Requests\Admin\StoreModBundleRequest;
use App\Models\ModBundle;
use App\Models\ModWorkshopLink;
use App\Models\WishlistMod;
use App\Services\AuditLogger;
use App\Services\DockerManager;
use App\Services\ModManager;
use App\Services\SteamWorkshopClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class ModController extends Controller
{
    public function __construct(
        private readonly ModManager $modManager,
        private readonly AuditLogger $auditLogger,
        private readonly DockerManager $dockerManager,
        private readonly SteamWorkshopClient $workshopClient,
    ) {}

    public function index(): Response
    {
        $mods = [];
        $pendingRestart = false;
        $serverStatus = 'offline';

        try {
            $serverStatus = $this->resolveServerStatus();
        } catch (\Throwable) {
            // Docker socket unreachable — treat server as stopped, keep rendering
        }

        $serverRunning = $serverStatus !== 'offline';

        try {
            $status = $this->modManager->listWithStatus(
                config('zomboid.paths.server_ini'),
                $serverRunning,
                config('zomboid.paths.workshop_content'),
            );
            $mods = $this->attachWorkshopIds($status['mods']);
            $pendingRestart = $status['pending_restart'];
        } catch (\Throwable) {
            // Config not available — render empty list rather than 500
        }

        return Inertia::render('admin/mods', [
            'mods' => $mods,
            'protectedWorkshopIds' => array_keys(ModManager::PROTECTED_MODS),
            'pendingRestart' => $pendingRestart,
            'serverStatus' => $serverStatus,
            'wishlist' => WishlistMod::query()
                ->orderByDesc('created_at')
                ->pluck('workshop_id'),
            'bundles' => $this->bundleMemberships(),
        ]);
    }

    /**
     * Give every mod row the full set of Workshop items it needs.
     *
     * A mod can span several uploads, which `Mods=`/`WorkshopItems=` has no way
     * to express and the disk scan can only ever answer with one item. Stored
     * links say what the admin actually meant, so where they exist they REPLACE
     * the scanned value rather than merging with it — otherwise a Workshop ID
     * the admin just removed would reappear for as long as its content is still
     * sitting on disk.
     *
     * @param  array<int, array<string, mixed>>  $mods
     * @return array<int, array<string, mixed>>
     */
    private function attachWorkshopIds(array $mods): array
    {
        $links = ModWorkshopLink::map();

        foreach ($mods as $i => $mod) {
            $mods[$i]['workshop_ids'] = $links[$mod['mod_id']]
                ?? ($mod['workshop_id'] !== '' ? [$mod['workshop_id']] : []);
        }

        return $mods;
    }

    /**
     * Every tracked bundle mapped to the Workshop IDs it currently contains,
     * for the UI to group installed and wishlisted rows by. Membership comes
     * from Steam (cached), so a collection that gains a mod regroups on its
     * own. Steam being unreachable just drops the grouping for that request
     * rather than breaking the page.
     *
     * @return array<string, list<string>>
     */
    private function bundleMemberships(): array
    {
        $bundleIds = ModBundle::query()->pluck('workshop_id')->all();

        if ($bundleIds === []) {
            return [];
        }

        try {
            return $this->workshopClient->getCollectionChildrenMany($bundleIds);
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Resolve a Workshop collection into the member Workshop IDs to act on,
     * or null when the ID is not a collection.
     *
     * @return list<string>|null
     */
    private function resolveBundleMembers(string $workshopId): ?array
    {
        try {
            $details = $this->workshopClient->getDetails($workshopId);

            if ($details === null || ! ($details['is_collection'] ?? false)) {
                return null;
            }

            return $this->workshopClient->getCollectionChildren($workshopId);
        } catch (\Throwable $e) {
            // Steam being unreachable must not block adding an ordinary mod —
            // fall back to treating the ID as a single item.
            Log::warning('Workshop collection lookup failed', ['exception' => $e, 'workshop_id' => $workshopId]);

            return null;
        }
    }

    /**
     * Replace every collection ID in a pasted list with the mods it contains,
     * recording each one as a bundle. Non-collection IDs pass through as-is,
     * order and duplicates intact — callers report "skipped" against the length
     * of this list, so silently collapsing repeats here would undercount it.
     * Steam lookups are batched, so a 100-ID paste costs two calls, not 200.
     *
     * @param  list<string>  $workshopIds
     * @return list<string>
     */
    private function expandBundlesInList(array $workshopIds): array
    {
        $unique = array_values(array_unique($workshopIds));

        try {
            $details = $this->workshopClient->getDetailsMany($unique);

            $bundleIds = array_values(array_filter(
                $unique,
                fn (string $id): bool => (bool) ($details[$id]['is_collection'] ?? false),
            ));

            if ($bundleIds === []) {
                return array_values($workshopIds);
            }

            $children = $this->workshopClient->getCollectionChildrenMany($bundleIds);
        } catch (\Throwable $e) {
            // Steam unreachable — import the IDs verbatim rather than failing
            // the whole paste; collections can be re-added once it's back.
            Log::warning('Workshop collection expansion failed', ['exception' => $e]);

            return array_values($workshopIds);
        }

        $expanded = [];

        foreach ($workshopIds as $id) {
            if (! in_array($id, $bundleIds, true)) {
                $expanded[] = $id;

                continue;
            }

            if (($children[$id] ?? []) === []) {
                continue;
            }

            ModBundle::query()->firstOrCreate(['workshop_id' => $id]);
            $expanded = array_merge($expanded, $children[$id]);
        }

        return array_values($expanded);
    }

    /**
     * Container state as the mod page needs it: 'starting' covers the whole
     * window between a restart being triggered and PZ actually having loaded
     * the mods (the game-server healthcheck only passes once RCON is up), so
     * the UI can show a restart is underway instead of re-offering the button.
     *
     * Anything other than Docker's own 'starting' counts as 'online' — a
     * container with no healthcheck reports null, and an 'unhealthy' one is
     * past booting, so in both cases we'd rather offer the restart button than
     * disable it forever.
     *
     * @return 'offline'|'starting'|'online'
     */
    private function resolveServerStatus(): string
    {
        $status = $this->dockerManager->getContainerStatus();

        if (! ($status['running'] ?? false)) {
            return 'offline';
        }

        return ($status['health_status'] ?? null) === 'starting' ? 'starting' : 'online';
    }

    /**
     * Batch-fetch Workshop metadata (title, thumbnail, tags, build
     * compatibility, stats) for the given Workshop IDs. Entries that are
     * missing on Steam come back as null.
     */
    public function details(ModDetailsRequest $request): JsonResponse
    {
        $details = $this->workshopClient->getDetailsMany(
            $request->validated('workshop_ids'),
        );

        return response()->json([
            'details' => $details === [] ? (object) [] : $details,
        ]);
    }

    public function wishlistStore(AddWishlistModRequest $request): JsonResponse
    {
        $workshopId = $request->validated('workshop_id');

        $members = $this->resolveBundleMembers($workshopId);

        if ($members !== null && $members !== []) {
            ModBundle::query()->firstOrCreate(['workshop_id' => $workshopId]);
            $result = $this->wishlistMembers($members);

            $this->auditLogger->log(
                actor: $request->user()->name ?? 'admin',
                action: 'mod.bundle.add',
                target: $workshopId,
                details: ['target' => 'wishlist'] + $result,
                ip: $request->ip(),
            );

            return response()->json([
                'workshop_id' => $workshopId,
                'bundle_id' => $workshopId,
                'members' => $members,
            ] + $result, 201);
        }

        WishlistMod::query()->firstOrCreate(['workshop_id' => $workshopId]);

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.wishlist.add',
            target: $workshopId,
            ip: $request->ip(),
        );

        return response()->json(['workshop_id' => $workshopId], 201);
    }

    public function wishlistDestroy(Request $request, string $workshopId): JsonResponse
    {
        $deleted = WishlistMod::query()
            ->where('workshop_id', $workshopId)
            ->delete();

        if ($deleted === 0) {
            return response()->json(['error' => 'Mod is not on the wishlist'], 404);
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.wishlist.remove',
            target: $workshopId,
            ip: $request->ip(),
        );

        return response()->json(['removed' => $workshopId]);
    }

    /**
     * Bulk-add Workshop IDs to the wishlist, skipping any that are already
     * installed or already wishlisted. Any collection ID in the list is
     * recorded as a bundle and replaced by the mods it contains.
     */
    public function wishlistImport(ImportWishlistRequest $request): JsonResponse
    {
        $ids = $this->expandBundlesInList($request->validated('workshop_ids'));

        $installed = collect($this->modManager->list(
            config('zomboid.paths.server_ini'),
            config('zomboid.paths.workshop_content'),
        ))->pluck('workshop_id')->filter()->all();

        $skip = array_flip(array_merge(
            $installed,
            WishlistMod::query()->pluck('workshop_id')->all(),
        ));

        $added = [];

        foreach ($ids as $id) {
            if (isset($skip[$id])) {
                continue;
            }

            WishlistMod::query()->create(['workshop_id' => $id]);
            $skip[$id] = true;
            $added[] = $id;
        }

        if ($added !== []) {
            $this->auditLogger->log(
                actor: $request->user()->name ?? 'admin',
                action: 'mod.wishlist.import',
                details: ['added' => $added, 'skipped' => count($ids) - count($added)],
                ip: $request->ip(),
            );
        }

        return response()->json([
            'added' => $added,
            'skipped' => count($ids) - count($added),
        ], 201);
    }

    public function lookup(LookupWorkshopModRequest $request): JsonResponse
    {
        $workshopId = $request->validated('workshop_id');
        $details = $this->workshopClient->getDetails($workshopId);

        if ($details === null) {
            return response()->json([
                'found' => false,
                'workshop_id' => $workshopId,
            ], 404);
        }

        return response()->json([
            'found' => true,
            'workshop_id' => $details['workshop_id'],
            'title' => $details['title'],
            'preview_url' => $details['preview_url'],
            'mod_ids' => $details['mod_ids'],
            'map_folders' => $details['map_folders'],
            'build_compat' => $details['build_compat'],
            'is_bundle' => $details['is_collection'],
            'members' => $details['is_collection']
                ? $this->workshopClient->getCollectionChildren($workshopId)
                : [],
        ]);
    }

    /**
     * Install every mod in a Workshop collection and record the collection so
     * the UI keeps its members grouped. Members whose Workshop page declares no
     * `Mod ID:` are reported back as unresolved instead of silently dropped —
     * they have to be added by hand, exactly like the bulk importer does.
     */
    public function bundleStore(StoreModBundleRequest $request): JsonResponse
    {
        $bundleId = $request->validated('workshop_id');
        $members = $this->resolveBundleMembers($bundleId);

        if ($members === null) {
            return response()->json([
                'error' => 'That Workshop ID is not a collection.',
            ], 422);
        }

        if ($members === []) {
            return response()->json(['error' => 'That collection is empty.'], 422);
        }

        ModBundle::query()->firstOrCreate(['workshop_id' => $bundleId]);

        $result = $request->validated('target') === 'wishlist'
            ? $this->wishlistMembers($members)
            : $this->installMembers($members);

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.bundle.add',
            target: $bundleId,
            details: ['target' => $request->validated('target')] + $result,
            ip: $request->ip(),
        );

        return response()->json([
            'bundle_id' => $bundleId,
            'members' => $members,
            'restart_required' => $request->validated('target') === 'installed',
        ] + $result, 201);
    }

    /**
     * @param  list<string>  $members
     * @return array{added: int, unresolved: list<string>}
     */
    private function wishlistMembers(array $members): array
    {
        $installed = collect($this->modManager->list(
            config('zomboid.paths.server_ini'),
            config('zomboid.paths.workshop_content'),
        ))->pluck('workshop_id')->filter()->all();

        $added = 0;

        foreach ($members as $id) {
            if (in_array($id, $installed, true)) {
                continue;
            }

            $added += WishlistMod::query()->firstOrCreate(['workshop_id' => $id])->wasRecentlyCreated ? 1 : 0;
        }

        return ['added' => $added, 'unresolved' => []];
    }

    /**
     * @param  list<string>  $members
     * @return array{added: int, unresolved: list<string>}
     */
    private function installMembers(array $members): array
    {
        $details = $this->workshopClient->getDetailsMany($members);

        $workshopIds = [];
        $modIds = [];
        $mapFolders = [];
        $unresolved = [];

        foreach ($members as $id) {
            $member = $details[$id] ?? null;

            if ($member === null || $member['mod_ids'] === []) {
                $unresolved[] = $id;

                continue;
            }

            $workshopIds[] = $id;
            $modIds = array_merge($modIds, $member['mod_ids']);
            $mapFolders = array_merge($mapFolders, $member['map_folders']);
        }

        if ($workshopIds === []) {
            return ['added' => 0, 'unresolved' => $unresolved];
        }

        $summary = $this->modManager->bulkImport(
            config('zomboid.paths.server_ini'),
            $workshopIds,
            $modIds,
            $mapFolders,
        );

        WishlistMod::query()->whereIn('workshop_id', $workshopIds)->delete();

        return ['added' => $summary['mods_added'], 'unresolved' => $unresolved];
    }

    /**
     * Uninstall or un-wishlist every member of a bundle in one go. The bundle
     * record itself is kept so a "move to wishlist" round trip (uninstall, then
     * wishlist) still renders as one group — use `bundleUnbundle` to dissolve it.
     */
    public function bundleDestroy(Request $request, string $workshopId): JsonResponse
    {
        $validated = $request->validate([
            'target' => ['required', 'in:installed,wishlist'],
            'to_wishlist' => ['sometimes', 'boolean'],
        ]);

        if (! ModBundle::query()->where('workshop_id', $workshopId)->exists()) {
            return response()->json(['error' => 'Bundle not found'], 404);
        }

        $members = $this->workshopClient->getCollectionChildren($workshopId);

        if ($validated['target'] === 'wishlist') {
            $removed = WishlistMod::query()->whereIn('workshop_id', $members)->delete();

            $this->auditLogger->log(
                actor: $request->user()->name ?? 'admin',
                action: 'mod.bundle.wishlist.remove',
                target: $workshopId,
                details: ['removed' => $removed],
                ip: $request->ip(),
            );

            return response()->json(['removed' => $removed]);
        }

        try {
            $removed = $this->modManager->removeWorkshopItems(
                config('zomboid.paths.server_ini'),
                $members,
                config('zomboid.paths.workshop_content'),
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to remove bundle', ['exception' => $e, 'workshop_id' => $workshopId]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        if ($validated['to_wishlist'] ?? false) {
            foreach ($removed['workshop_ids'] as $id) {
                WishlistMod::query()->firstOrCreate(['workshop_id' => $id]);
            }
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.bundle.remove',
            target: $workshopId,
            details: $removed + ['to_wishlist' => (bool) ($validated['to_wishlist'] ?? false)],
            ip: $request->ip(),
        );

        return response()->json([
            'removed' => $removed,
            'restart_required' => true,
        ]);
    }

    /**
     * Drop the grouping only: members stay installed/wishlisted but are managed
     * individually from here on.
     */
    public function bundleUnbundle(Request $request, string $workshopId): JsonResponse
    {
        $deleted = ModBundle::query()->where('workshop_id', $workshopId)->delete();

        if ($deleted === 0) {
            return response()->json(['error' => 'Bundle not found'], 404);
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.bundle.unbundle',
            target: $workshopId,
            ip: $request->ip(),
        );

        return response()->json(['unbundled' => $workshopId]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'workshop_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'workshop_ids' => ['sometimes', 'array', 'max:32'],
            'workshop_ids.*' => ['string', 'regex:/^\d{1,20}$/'],
            'mod_id' => ['required', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
            'map_folder' => ['nullable', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
        ]);

        $workshopIds = array_values(array_unique(array_merge(
            [$validated['workshop_id']],
            $validated['workshop_ids'] ?? [],
        )));

        try {
            $this->modManager->add(
                config('zomboid.paths.server_ini'),
                $validated['workshop_id'],
                $validated['mod_id'],
                $validated['map_folder'] ?? null,
                array_slice($workshopIds, 1),
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to add mod', ['exception' => $e, 'mod' => $validated]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        $this->linkWorkshopIds($validated['mod_id'], $workshopIds);

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.add',
            target: $validated['workshop_id'],
            details: $validated + ['workshop_ids' => $workshopIds],
            ip: $request->ip(),
        );

        return response()->json([
            'added' => $validated + ['workshop_ids' => $workshopIds],
            'restart_required' => true,
        ], 201);
    }

    /**
     * Replace a mod's stored Workshop links with exactly `$workshopIds`.
     *
     * @param  list<string>  $workshopIds
     */
    private function linkWorkshopIds(string $modId, array $workshopIds): void
    {
        ModWorkshopLink::query()->where('mod_id', $modId)->delete();

        foreach ($workshopIds as $workshopId) {
            ModWorkshopLink::query()->create([
                'mod_id' => $modId,
                'workshop_id' => $workshopId,
            ]);
        }
    }

    /**
     * Change which Workshop items an already-installed mod needs.
     *
     * `WorkshopItems=` is updated to match: newly listed items are appended so
     * PZ downloads them, dropped ones are removed — unless another still-installed
     * mod also needs them, since `WorkshopItems=` is one shared list and pruning
     * an item out from under a sibling mod would break it.
     */
    public function updateWorkshopIds(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mod_id' => ['required', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
            'workshop_ids' => ['present', 'array', 'max:32'],
            'workshop_ids.*' => ['string', 'regex:/^\d{1,20}$/'],
        ]);

        $modId = $validated['mod_id'];
        $desired = array_values(array_unique($validated['workshop_ids']));

        $mods = $this->attachWorkshopIds($this->modManager->list(
            config('zomboid.paths.server_ini'),
            config('zomboid.paths.workshop_content'),
        ));

        $target = null;
        $claimedByOthers = [];

        foreach ($mods as $mod) {
            if ($mod['mod_id'] === $modId) {
                $target = $mod;

                continue;
            }

            $claimedByOthers = array_merge($claimedByOthers, $mod['workshop_ids']);
        }

        if ($target === null) {
            return response()->json(['error' => 'Mod not found'], 404);
        }

        try {
            $changed = $this->modManager->updateWorkshopItems(
                config('zomboid.paths.server_ini'),
                array_values(array_diff($desired, $target['workshop_ids'])),
                array_values(array_diff($target['workshop_ids'], $desired, $claimedByOthers)),
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to update mod workshop ids', ['exception' => $e, 'mod_id' => $modId]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        $this->linkWorkshopIds($modId, $desired);

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.workshop_ids.update',
            target: $modId,
            details: ['workshop_ids' => $desired] + $changed,
            ip: $request->ip(),
        );

        return response()->json([
            'mod_id' => $modId,
            'workshop_ids' => $desired,
            'restart_required' => $changed['added'] !== [] || $changed['removed'] !== [],
        ] + $changed);
    }

    public function destroy(Request $request, string $workshopId): JsonResponse
    {
        $validated = $request->validate([
            'mod_id' => ['nullable', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
        ]);

        if (ModManager::isProtected($workshopId)) {
            return response()->json([
                'error' => 'This mod is required by the manager and cannot be removed.',
            ], 422);
        }

        $modId = $validated['mod_id'] ?? null;

        try {
            $removed = $this->modManager->remove(
                config('zomboid.paths.server_ini'),
                $workshopId,
                modId: $modId,
                workshopContentPath: config('zomboid.paths.workshop_content'),
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to remove mod', ['exception' => $e, 'workshop_id' => $workshopId]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        if (! $removed) {
            return response()->json(['error' => 'Mod not found'], 404);
        }

        ModWorkshopLink::query()
            ->whereIn('mod_id', array_merge([$removed['mod_id']], $removed['cascaded'] ?? []))
            ->delete();

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.remove',
            target: $workshopId,
            details: $removed,
            ip: $request->ip(),
        );

        return response()->json([
            'removed' => $removed,
            'restart_required' => true,
        ]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mods' => 'required|array',
            'mods.*.workshop_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'mods.*.mod_id' => ['required', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
        ]);

        try {
            $this->modManager->reorder(
                config('zomboid.paths.server_ini'),
                $validated['mods'],
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to reorder mods', ['exception' => $e]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.reorder',
            details: ['count' => count($validated['mods'])],
            ip: $request->ip(),
        );

        $serverRunning = (bool) ($this->dockerManager->getContainerStatus()['running'] ?? false);
        $status = $this->modManager->listWithStatus(
            config('zomboid.paths.server_ini'),
            $serverRunning,
            config('zomboid.paths.workshop_content'),
        );

        return response()->json([
            'mods' => $this->attachWorkshopIds($status['mods']),
            'pending_restart' => $status['pending_restart'],
            'restart_required' => true,
        ]);
    }

    /**
     * Merge a pasted modpack (Workshop/Mods pairs + optional map folders) into the
     * current list in one write. The result lands in `.mod_state` so it survives
     * container restarts; map folders are persisted to `.config_state` too.
     */
    public function import(ImportModsRequest $request): JsonResponse
    {
        $workshopIds = $request->validated('workshop_ids', []);
        $modIds = $request->validated('mod_ids', []);
        $mapFolders = $request->validated('map', []);

        try {
            $summary = $this->modManager->bulkImport(
                config('zomboid.paths.server_ini'),
                $workshopIds,
                $modIds,
                $mapFolders,
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to bulk import mods', ['exception' => $e]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.import',
            target: 'server.ini',
            details: $summary,
            ip: $request->ip(),
        );

        $serverRunning = false;

        try {
            $serverRunning = (bool) ($this->dockerManager->getContainerStatus()['running'] ?? false);
        } catch (\Throwable) {
            // Docker socket unreachable — report the list without live status
        }

        $status = $this->modManager->listWithStatus(
            config('zomboid.paths.server_ini'),
            $serverRunning,
            config('zomboid.paths.workshop_content'),
        );

        return response()->json([
            'mods' => $this->attachWorkshopIds($status['mods']),
            'pending_restart' => $status['pending_restart'],
            'summary' => $summary,
            'restart_required' => true,
        ], 201);
    }
}
