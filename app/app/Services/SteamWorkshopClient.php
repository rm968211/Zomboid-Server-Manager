<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Thin client for the public Steam Workshop endpoint
 * `ISteamRemoteStorage/GetPublishedFileDetails`, which does not require
 * an API key. Used by the mod admin UI to derive the PZ `mod_id` from
 * a Workshop file ID by parsing the conventional `Mod ID:` lines that
 * PZ modders put in their description, and to enrich mod cards with
 * Workshop metadata (thumbnail, tags, build compatibility, stats).
 *
 * @phpstan-type WorkshopDetails array{
 *     workshop_id: string,
 *     title: string,
 *     description: string,
 *     preview_url: ?string,
 *     mod_ids: list<string>,
 *     map_folders: list<string>,
 *     tags: list<string>,
 *     build_compat: string,
 *     time_updated: ?int,
 *     file_size: ?int,
 *     subscriptions: ?int,
 * }
 */
class SteamWorkshopClient
{
    private const ENDPOINT = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';

    private const CACHE_TTL_SECONDS = 600;

    /**
     * Bumped whenever the parsed shape changes so stale entries from
     * older releases are never served.
     */
    private const CACHE_KEY_PREFIX = 'steam_workshop:details:v2:';

    private const BATCH_SIZE = 100;

    public function __construct(private readonly int $timeoutSeconds = 10) {}

    /**
     * Fetch and parse Workshop metadata for a single published file ID.
     *
     * @return WorkshopDetails|null Null when Steam returns a non-success status or the file is missing.
     */
    public function getDetails(string $workshopId): ?array
    {
        return $this->getDetailsMany([$workshopId])[trim($workshopId)] ?? null;
    }

    /**
     * Fetch metadata for many published file IDs at once, keyed by ID.
     * Cached IDs are served from cache; the rest are fetched in batched
     * requests. Missing/invalid IDs map to null.
     *
     * @param  list<string>  $workshopIds
     * @return array<string, WorkshopDetails|null>
     */
    public function getDetailsMany(array $workshopIds): array
    {
        $results = [];
        $misses = [];

        foreach (array_unique(array_map('trim', $workshopIds)) as $id) {
            if ($id === '' || ! ctype_digit($id)) {
                continue;
            }

            $cached = Cache::get(self::CACHE_KEY_PREFIX.$id);
            if ($cached !== null) {
                $results[$id] = $cached;
            } else {
                $misses[] = $id;
            }
        }

        foreach (array_chunk($misses, self::BATCH_SIZE) as $chunk) {
            $fetched = $this->fetchBatch($chunk);

            foreach ($chunk as $id) {
                $results[$id] = $fetched[$id] ?? null;

                if ($results[$id] !== null) {
                    Cache::put(self::CACHE_KEY_PREFIX.$id, $results[$id], self::CACHE_TTL_SECONDS);
                }
            }
        }

        return $results;
    }

    /**
     * @param  list<string>  $workshopIds
     * @return array<string, WorkshopDetails>
     */
    private function fetchBatch(array $workshopIds): array
    {
        $payload = ['itemcount' => count($workshopIds)];
        foreach (array_values($workshopIds) as $i => $id) {
            $payload["publishedfileids[{$i}]"] = $id;
        }

        $response = Http::timeout($this->timeoutSeconds)
            ->asForm()
            ->post(self::ENDPOINT, $payload);

        if (! $response->successful()) {
            return [];
        }

        $files = $response->json('response.publishedfiledetails');
        if (! is_array($files)) {
            return [];
        }

        $parsed = [];
        foreach ($files as $file) {
            if (! is_array($file)) {
                continue;
            }

            $details = $this->parseFile($file);
            if ($details !== null) {
                $parsed[$details['workshop_id']] = $details;
            }
        }

        return $parsed;
    }

    /**
     * @param  array<string, mixed>  $file
     * @return WorkshopDetails|null
     */
    private function parseFile(array $file): ?array
    {
        if (($file['result'] ?? 0) !== 1) {
            return null;
        }

        $workshopId = (string) ($file['publishedfileid'] ?? '');
        if ($workshopId === '') {
            return null;
        }

        $description = (string) ($file['description'] ?? '');
        $tags = $this->extractTags($file['tags'] ?? null);

        return [
            'workshop_id' => $workshopId,
            'title' => (string) ($file['title'] ?? ''),
            'description' => $description,
            'preview_url' => isset($file['preview_url']) ? (string) $file['preview_url'] : null,
            'mod_ids' => $this->extractMatches('/Mod\s*ID\s*:\s*([\w.\-]+)/i', $description),
            'map_folders' => $this->extractMatches('/Map\s*Folder\s*:\s*([\w.\-]+)/i', $description),
            'tags' => $tags,
            'build_compat' => $this->detectBuildCompat($tags),
            'time_updated' => isset($file['time_updated']) ? (int) $file['time_updated'] : null,
            'file_size' => isset($file['file_size']) ? (int) $file['file_size'] : null,
            'subscriptions' => isset($file['subscriptions']) ? (int) $file['subscriptions'] : null,
        ];
    }

    /**
     * PZ modders tag Workshop items with the game builds they support.
     * A mod tagged for both builds counts as B42-compatible.
     *
     * @param  list<string>  $tags
     */
    private function detectBuildCompat(array $tags): string
    {
        $lower = array_map('strtolower', $tags);

        if (array_intersect($lower, ['build 42', 'b42'])) {
            return 'b42';
        }

        if (array_intersect($lower, ['build 41', 'b41'])) {
            return 'b41';
        }

        return 'unknown';
    }

    /**
     * @return list<string>
     */
    private function extractTags(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $tags = [];
        foreach ($raw as $entry) {
            $tag = is_array($entry) ? (string) ($entry['tag'] ?? '') : '';
            if ($tag !== '') {
                $tags[] = $tag;
            }
        }

        return $tags;
    }

    /**
     * Pull unique capture-group-1 matches in the order they appear.
     *
     * @return list<string>
     */
    private function extractMatches(string $pattern, string $haystack): array
    {
        if (! preg_match_all($pattern, $haystack, $matches)) {
            return [];
        }

        return array_values(array_unique(array_map('trim', $matches[1])));
    }
}
