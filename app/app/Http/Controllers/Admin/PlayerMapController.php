<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\MapConfigBuilder;
use App\Services\OnlinePlayersReader;
use App\Services\PlayerPositionReader;
use App\Services\PlayersDbReader;
use App\Services\SafeZoneManager;
use App\Services\ServerStatusResolver;
use Illuminate\Http\Response;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PlayerMapController extends Controller
{
    public function __construct(
        private readonly PlayersDbReader $playersDb,
        private readonly PlayerPositionReader $positionReader,
        private readonly OnlinePlayersReader $onlinePlayers,
        private readonly ServerStatusResolver $statusResolver,
        private readonly MapConfigBuilder $mapConfigBuilder,
        private readonly SafeZoneManager $safeZoneManager,
    ) {}

    public function __invoke(): InertiaResponse
    {
        $resolved = $this->statusResolver->resolve();
        $dbPlayers = $this->playersDb->getAllPlayerPositions();
        $liveData = $this->positionReader->getLivePositions();

        // Use OnlinePlayersReader for reliable online detection (log → RCON → Lua)
        $onlineUsernames = $this->onlinePlayers->getOnlineUsernames();

        // Positions keep being used when stale — the last known spot beats the
        // players.db fallback, which is only written on save/logout and is
        // usually older still. The UI is told instead, so an out-of-date dot
        // isn't presented as current. PZ pauses the world with nobody online,
        // which stops the export tick, so staleness is normal after a quiet
        // spell and only worth flagging while someone is actually connected.
        $positionsStale = $this->positionReader->isStale();

        $livePositions = [];

        if ($liveData !== null && ! empty($liveData['players'])) {
            foreach ($liveData['players'] as $player) {
                $username = $player['username'] ?? '';
                $livePositions[$username] = $player;
            }
        }

        $markers = [];

        foreach ($dbPlayers as $player) {
            $username = $player['username'];
            $isOnline = in_array($username, $onlineUsernames);

            if ($isOnline && isset($livePositions[$username])) {
                $live = $livePositions[$username];
                $isDead = $live['is_dead'] ?? $player['is_dead'];

                $markers[] = [
                    'username' => $username,
                    'name' => $player['name'],
                    'x' => (float) $live['x'],
                    'y' => (float) $live['y'],
                    'z' => (int) ($live['z'] ?? 0),
                    'status' => $isDead ? 'dead' : 'online',
                    'is_online' => true,
                ];
            } elseif ($isOnline) {
                $markers[] = [
                    'username' => $username,
                    'name' => $player['name'],
                    'x' => $player['x'],
                    'y' => $player['y'],
                    'z' => $player['z'],
                    'status' => $player['is_dead'] ? 'dead' : 'online',
                    'is_online' => true,
                ];
            } else {
                $markers[] = [
                    'username' => $username,
                    'name' => $player['name'],
                    'x' => $player['x'],
                    'y' => $player['y'],
                    'z' => $player['z'],
                    'status' => $player['is_dead'] ? 'dead' : 'offline',
                    'is_online' => false,
                ];
            }
        }

        // Add any online players not in the DB (new connections or DB unavailable)
        foreach ($onlineUsernames as $username) {
            $alreadyAdded = collect($markers)->contains('username', $username);
            if (! $alreadyAdded) {
                $live = $livePositions[$username] ?? null;
                $markers[] = [
                    'username' => $username,
                    'name' => $live['name'] ?? $username,
                    'x' => $live ? (float) $live['x'] : 0.0,
                    'y' => $live ? (float) $live['y'] : 0.0,
                    'z' => $live ? (int) ($live['z'] ?? 0) : 0,
                    'status' => ($live && ($live['is_dead'] ?? false)) ? 'dead' : 'online',
                    'is_online' => true,
                ];
            }
        }

        $mapConfig = $this->mapConfigBuilder->build();
        $safeZoneConfig = $this->safeZoneManager->getConfig();
        $generationStatus = $this->readGenerationStatus();

        return Inertia::render('admin/player-map', [
            'markers' => $markers,
            'onlineCount' => $resolved['player_count'],
            'serverStatus' => $resolved['game_status'],
            'positionsStale' => $positionsStale && $onlineUsernames !== [],
            'positionsUpdatedAt' => $liveData['timestamp'] ?? null,
            'mapConfig' => $mapConfig,
            'hasTiles' => $mapConfig['tileUrl'] !== null,
            'usingLocalTiles' => $mapConfig['source'] === 'local',
            'tilesGenerating' => $generationStatus['status'] === 'running',
            'tileError' => $generationStatus['status'] === 'failed' ? $generationStatus['error'] : null,
            'tileGenerationStage' => $generationStatus['stage'],
            'tileGenerationStartedAt' => $generationStatus['started_at'],
            'safeZones' => $safeZoneConfig['enabled'] ? $safeZoneConfig['zones'] : [],
        ]);
    }

    /**
     * Read the last known status of the background map-tile generation command,
     * written by GenerateMapTiles, so the admin UI can show what actually happened
     * instead of a generic "no tiles yet" message.
     *
     * @return array{status: string, error: string|null, stage: string|null, started_at: string|null}
     */
    private function readGenerationStatus(): array
    {
        $statusPath = config('zomboid.map.status_path');

        if (! is_file($statusPath)) {
            return [
                'status' => 'unknown',
                'error' => null,
                'stage' => null,
                'started_at' => null,
            ];
        }

        $data = json_decode(file_get_contents($statusPath), true);

        return [
            'status' => $data['status'] ?? 'unknown',
            'error' => $data['error'] ?? null,
            'stage' => $data['stage'] ?? null,
            'started_at' => $data['started_at'] ?? null,
        ];
    }

    /**
     * Serve a map tile from the configured tiles path.
     */
    public function tile(string $level, string $tile): BinaryFileResponse|Response
    {
        if (! ctype_digit($level) || ! preg_match('/^\d+_\d+\.(?:webp|jpg)$/', $tile)) {
            return response('Not found', 404);
        }

        $tilesPath = config('zomboid.map.tiles_path');
        $dziPath = $tilesPath.'/html/map_data/base/layer0_files';

        // Try webp first, then jpg
        $baseTile = pathinfo($tile, PATHINFO_FILENAME);
        $filePath = null;
        $contentType = 'image/webp';

        foreach (['webp', 'jpg'] as $ext) {
            $candidate = $dziPath.'/'.$level.'/'.$baseTile.'.'.$ext;
            if (is_file($candidate)) {
                $filePath = $candidate;
                $contentType = $ext === 'jpg' ? 'image/jpeg' : 'image/webp';
                break;
            }
        }

        if ($filePath === null) {
            // Return transparent 1x1 PNG for missing tiles (avoids broken-image placeholders in Leaflet)
            return response(base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), 200, [
                'Content-Type' => 'image/png',
                'Cache-Control' => 'public, max-age=86400',
            ]);
        }

        // Prevent path traversal
        $realTilesPath = realpath($dziPath);
        $realFilePath = realpath($filePath);
        $tilesPrefix = $realTilesPath === false
            ? null
            : rtrim($realTilesPath, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        if ($tilesPrefix === null || $realFilePath === false || ! str_starts_with($realFilePath, $tilesPrefix)) {
            return response('Not found', 404);
        }

        return response()->file($realFilePath, [
            'Cache-Control' => 'public, max-age=86400',
            'Content-Type' => $contentType,
        ]);
    }
}
