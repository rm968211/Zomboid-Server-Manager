<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AddWatchlistModRequest;
use App\Http\Requests\Admin\ImportModsRequest;
use App\Http\Requests\Admin\LookupWorkshopModRequest;
use App\Http\Requests\Admin\ModDetailsRequest;
use App\Models\WatchlistMod;
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
        $serverRunning = false;

        try {
            $serverRunning = (bool) ($this->dockerManager->getContainerStatus()['running'] ?? false);
        } catch (\Throwable) {
            // Docker socket unreachable — treat server as stopped, keep rendering
        }

        try {
            $status = $this->modManager->listWithStatus(
                config('zomboid.paths.server_ini'),
                $serverRunning,
                config('zomboid.paths.workshop_content'),
            );
            $mods = $status['mods'];
            $pendingRestart = $status['pending_restart'];
        } catch (\Throwable) {
            // Config not available — render empty list rather than 500
        }

        return Inertia::render('admin/mods', [
            'mods' => $mods,
            'protectedWorkshopIds' => array_keys(ModManager::PROTECTED_MODS),
            'pendingRestart' => $pendingRestart,
            'serverRunning' => $serverRunning,
            'watchlist' => WatchlistMod::query()
                ->orderByDesc('created_at')
                ->pluck('workshop_id'),
        ]);
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

    public function watchlistStore(AddWatchlistModRequest $request): JsonResponse
    {
        $workshopId = $request->validated('workshop_id');

        WatchlistMod::query()->firstOrCreate(['workshop_id' => $workshopId]);

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.watchlist.add',
            target: $workshopId,
            ip: $request->ip(),
        );

        return response()->json(['workshop_id' => $workshopId], 201);
    }

    public function watchlistDestroy(Request $request, string $workshopId): JsonResponse
    {
        $deleted = WatchlistMod::query()
            ->where('workshop_id', $workshopId)
            ->delete();

        if ($deleted === 0) {
            return response()->json(['error' => 'Mod is not on the watchlist'], 404);
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.watchlist.remove',
            target: $workshopId,
            ip: $request->ip(),
        );

        return response()->json(['removed' => $workshopId]);
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
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'workshop_id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'mod_id' => ['required', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
            'map_folder' => ['nullable', 'string', 'max:255', 'not_regex:/[;\r\n]/'],
        ]);

        try {
            $this->modManager->add(
                config('zomboid.paths.server_ini'),
                $validated['workshop_id'],
                $validated['mod_id'],
                $validated['map_folder'] ?? null,
            );
        } catch (RuntimeException $e) {
            Log::error('Failed to add mod', ['exception' => $e, 'mod' => $validated]);

            return response()->json([
                'error' => 'Could not write the server config. The server may still be starting, or the config volume is not writable.',
            ], 500);
        }

        $this->auditLogger->log(
            actor: $request->user()->name ?? 'admin',
            action: 'mod.add',
            target: $validated['workshop_id'],
            details: $validated,
            ip: $request->ip(),
        );

        return response()->json([
            'added' => $validated,
            'restart_required' => true,
        ], 201);
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

        try {
            $removed = $this->modManager->remove(
                config('zomboid.paths.server_ini'),
                $workshopId,
                modId: $validated['mod_id'] ?? null,
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
            'mods' => $status['mods'],
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
            'mods' => $status['mods'],
            'pending_restart' => $status['pending_restart'],
            'summary' => $summary,
            'restart_required' => true,
        ], 201);
    }
}
