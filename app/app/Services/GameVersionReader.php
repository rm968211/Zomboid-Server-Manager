<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class GameVersionReader
{
    /**
     * Versioned so deployments of the freshness-aware reader do not keep a
     * stale value written by the previous detection order for up to 24 hours.
     */
    private const CACHE_KEY = 'pz.game_version.v2';

    private const CACHE_TTL = 86400;

    private const CONSOLE_READ_CHUNK_SIZE = 65536;

    private const CONSOLE_MATCH_OVERLAP = 256;

    public function __construct(
        private readonly GameStateReader $gameStateReader,
        private readonly DockerManager $docker,
    ) {}

    /**
     * Detect the current game version from Lua bridge, console log, or Docker logs.
     */
    public function detectVersion(): ?string
    {
        // Primary: use the Lua bridge only while it is actively updating. A
        // server update/restart can leave the previous build's snapshot behind.
        $state = $this->gameStateReader->getGameState();
        if (! empty($state['game_version']) && ! $this->gameStateReader->isStale()) {
            return $this->extractVersionNumber($state['game_version']);
        }

        // Secondary: parse the current version from server-console.txt.
        $consoleVersion = $this->detectVersionFromConsoleLog();
        if ($consoleVersion !== null) {
            return $consoleVersion;
        }

        // Then try Docker output in case the console file is unavailable.
        $dockerVersion = $this->detectVersionFromLogs();
        if ($dockerVersion !== null) {
            return $dockerVersion;
        }

        // An old Lua snapshot is still useful as a last-known version while the
        // server is offline, but it must never override a current log entry.
        if (! empty($state['game_version'])) {
            return $this->extractVersionNumber($state['game_version']);
        }

        return null;
    }

    /**
     * Get cached game version without hitting filesystem/Docker.
     */
    public function getCachedVersion(): ?string
    {
        return Cache::get(self::CACHE_KEY);
    }

    /**
     * Detect version and cache it for 24 hours.
     */
    public function refreshVersion(): ?string
    {
        $version = $this->detectVersion();

        if ($version !== null) {
            Cache::put(self::CACHE_KEY, $version, self::CACHE_TTL);
        }

        return $version;
    }

    /**
     * Get the current Steam branch from override file or config fallback.
     */
    public function getCurrentBranch(): string
    {
        $overridePath = config('zomboid.paths.data').'/.steam_branch';

        if (is_readable($overridePath)) {
            $contents = @file_get_contents($overridePath);
            if ($contents !== false) {
                $branch = trim($contents);
                if ($branch !== '') {
                    return $branch;
                }
            }
        }

        return config('zomboid.steam_branch', 'public');
    }

    /**
     * Extract the numeric version from a full PZ version string.
     *
     * PZ's getCore():getVersion() returns strings like:
     * "<major>.<minor>.<patch> <hash> <date> <time> (ZB)"
     * This extracts just the numeric prefix (e.g. "42.16.1").
     */
    private function extractVersionNumber(string $raw): string
    {
        if (preg_match('/^([0-9]+\.[0-9]+(?:\.[0-9]+)*)/', trim($raw), $matches)) {
            return $matches[1];
        }

        return trim($raw);
    }

    /**
     * Parse PZ's server-console.txt for version string.
     *
     * More reliable than Docker logs since PZ runs inside a screen session.
     */
    private function detectVersionFromConsoleLog(): ?string
    {
        $path = config('zomboid.paths.data').'/server-console.txt';

        if (! file_exists($path)) {
            return null;
        }

        $fp = null;

        try {
            $size = @filesize($path);
            if ($size === false || $size === 0) {
                return null;
            }

            $fp = fopen($path, 'r');
            if ($fp === false) {
                return null;
            }

            // Search backwards in bounded chunks. Build 42 can emit enough
            // startup output to push version= outside a fixed tail window, while
            // long-lived logs can contain version lines from several boots.
            $offset = $size;
            $newerChunkPrefix = '';

            while ($offset > 0) {
                $readSize = min(self::CONSOLE_READ_CHUNK_SIZE, $offset);
                $offset -= $readSize;

                if (fseek($fp, $offset, SEEK_SET) !== 0) {
                    break;
                }

                $chunk = fread($fp, $readSize);
                if ($chunk === false || $chunk === '') {
                    break;
                }

                $searchBuffer = $chunk.$newerChunkPrefix;
                if (preg_match_all('/version(?:Number)?\s*=\s*([0-9]+\.[0-9]+(?:\.[0-9]+)*)/', $searchBuffer, $matches)) {
                    return end($matches[1]);
                }

                // Preserve enough of the newer chunk to detect a version line
                // split across the boundary between two reads.
                $newerChunkPrefix = substr($chunk, 0, self::CONSOLE_MATCH_OVERLAP);
            }
        } catch (\Throwable $e) {
            Log::debug('GameVersionReader: failed to read server-console.txt', [
                'error' => $e->getMessage(),
            ]);
        } finally {
            if (is_resource($fp)) {
                fclose($fp);
            }
        }

        return null;
    }

    /**
     * Parse Docker container logs for PZ version pattern.
     */
    private function detectVersionFromLogs(): ?string
    {
        try {
            $lines = $this->docker->getContainerLogs(200);
        } catch (\Throwable $e) {
            Log::debug('GameVersionReader: failed to read Docker logs', [
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        // PZ logs version as "versionNumber=42.0.3" or similar patterns
        foreach (array_reverse($lines) as $line) {
            if (preg_match('/versionNumber\s*=\s*([0-9]+\.[0-9]+(?:\.[0-9]+)*)/', $line, $matches)) {
                return $matches[1];
            }
        }

        return null;
    }
}
