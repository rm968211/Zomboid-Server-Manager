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
 *     is_collection: bool,
 * }
 */
class SteamWorkshopClient
{
    private const ENDPOINT = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';

    private const COLLECTION_ENDPOINT = 'https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/';

    private const CACHE_TTL_SECONDS = 600;

    /**
     * Bumped whenever the parsed shape changes so stale entries from
     * older releases are never served.
     */
    private const CACHE_KEY_PREFIX = 'steam_workshop:details:v4:';

    private const COLLECTION_CACHE_KEY_PREFIX = 'steam_workshop:collection:v1:';

    /**
     * Steam publishes collections under the Workshop's own app ID rather than
     * the game's, which is the only reliable "this is a collection, not a mod"
     * signal in the GetPublishedFileDetails payload.
     */
    private const COLLECTION_APP_ID = 766;

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
            'mod_ids' => $this->extractLabelled($description, 'Mod[ \t]*IDs?'),
            'map_folders' => $this->extractLabelled($description, 'Map[ \t]*Folders?'),
            'tags' => $tags,
            'build_compat' => $this->detectBuildCompat($tags),
            'time_updated' => isset($file['time_updated']) ? (int) $file['time_updated'] : null,
            'file_size' => isset($file['file_size']) ? (int) $file['file_size'] : null,
            'subscriptions' => isset($file['subscriptions']) ? (int) $file['subscriptions'] : null,
            'is_collection' => ((int) ($file['creator_app_id'] ?? 0)) === self::COLLECTION_APP_ID,
        ];
    }

    /**
     * Resolve the Workshop IDs a collection ("bundle") contains, in the
     * creator's own sort order. Non-collections and unknown IDs come back as
     * an empty list, so callers can probe without branching first.
     *
     * @return list<string>
     */
    public function getCollectionChildren(string $workshopId): array
    {
        return $this->getCollectionChildrenMany([$workshopId])[trim($workshopId)] ?? [];
    }

    /**
     * @param  list<string>  $workshopIds
     * @return array<string, list<string>>
     */
    public function getCollectionChildrenMany(array $workshopIds): array
    {
        $results = [];
        $misses = [];

        foreach (array_unique(array_map('trim', $workshopIds)) as $id) {
            if ($id === '' || ! ctype_digit($id)) {
                continue;
            }

            $cached = Cache::get(self::COLLECTION_CACHE_KEY_PREFIX.$id);
            if ($cached !== null) {
                $results[$id] = $cached;
            } else {
                $misses[] = $id;
            }
        }

        foreach (array_chunk($misses, self::BATCH_SIZE) as $chunk) {
            $fetched = $this->fetchCollectionBatch($chunk);

            foreach ($chunk as $id) {
                $results[$id] = $fetched[$id] ?? [];
                Cache::put(self::COLLECTION_CACHE_KEY_PREFIX.$id, $results[$id], self::CACHE_TTL_SECONDS);
            }
        }

        return $results;
    }

    /**
     * @param  list<string>  $workshopIds
     * @return array<string, list<string>>
     */
    private function fetchCollectionBatch(array $workshopIds): array
    {
        $payload = ['collectioncount' => count($workshopIds)];
        foreach (array_values($workshopIds) as $i => $id) {
            $payload["publishedfileids[{$i}]"] = $id;
        }

        $response = Http::timeout($this->timeoutSeconds)
            ->asForm()
            ->post(self::COLLECTION_ENDPOINT, $payload);

        if (! $response->successful()) {
            return [];
        }

        $collections = $response->json('response.collectiondetails');
        if (! is_array($collections)) {
            return [];
        }

        $parsed = [];
        foreach ($collections as $collection) {
            if (! is_array($collection) || ($collection['result'] ?? 0) !== 1) {
                continue;
            }

            $id = (string) ($collection['publishedfileid'] ?? '');
            if ($id === '') {
                continue;
            }

            $children = [];
            foreach ($collection['children'] ?? [] as $child) {
                $childId = is_array($child) ? (string) ($child['publishedfileid'] ?? '') : '';
                if ($childId !== '') {
                    $children[] = $childId;
                }
            }

            $parsed[$id] = $children;
        }

        return $parsed;
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
     * BBCode tags Steam actually renders. Deliberately an explicit list rather
     * than `\[[^\]]*\]`, because a leading build tag like `[B42] Tatrapan` is
     * part of the mod ID and a greedy pattern eats it.
     */
    private const BBCODE_TAG = '/\[\/?(?:b|i|u|s|strike|spoiler|noparse|hr|url|img|quote|code|list|olist|table|tr|th|td|h[1-6]|\*)(?:=[^\]]*)?\]/i';

    /**
     * Pull the values off `Label: value` lines, in the order they appear.
     *
     * The value runs to the end of the line rather than stopping at the first
     * unusual character, because real PZ mod IDs are not identifiers: they
     * contain spaces, apostrophes, brackets and slashes (`GanydeBielovzki's
     * Frockin Splendor!`, `Diederiks Tile Palooza`, `1299328280/ToadTraits`,
     * `[B42] Tatrapan`). Stopping early is worse than not parsing at all — a
     * truncated ID matches no mod.info, so PZ silently declines to load the
     * mod, and several mods by one author can truncate to the SAME string and
     * collapse into a single entry. Map folder names have spaces likewise.
     *
     * The label must open its own line, so prose that happens to mention
     * "Mod ID:" mid-sentence cannot inject an entry.
     *
     * @return list<string>
     */
    private function extractLabelled(string $haystack, string $label): array
    {
        // Strip tags first: modders write `[b]Mod ID:[/b] Foo` as often as not,
        // which wraps the label itself, not just the value.
        $haystack = (string) preg_replace(self::BBCODE_TAG, '', $haystack);

        $pattern = '/^[^\S\r\n]*'.$label.'[^\S\r\n]*:[^\S\r\n]*(.+)$/mi';

        if (! preg_match_all($pattern, $haystack, $matches)) {
            return [];
        }

        $values = [];

        foreach ($matches[1] as $raw) {
            $value = trim($raw);

            // `;` and `=` are the INI's own separators, so a value holding one
            // could never be written back out — skip it rather than emit an ID
            // that would corrupt the Mods= line.
            if ($value === '' || preg_match('/[;=]/', $value)) {
                continue;
            }

            $values[] = $value;
        }

        return array_values(array_unique($values));
    }
}
