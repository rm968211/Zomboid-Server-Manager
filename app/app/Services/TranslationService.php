<?php

namespace App\Services;

use App\Models\Language;
use App\Models\Translation;
use Illuminate\Support\Facades\Cache;

class TranslationService
{
    /**
     * Get all translations for a locale, merging JSON file defaults with DB overrides.
     *
     * @return array<string, string>
     */
    public static function getForLocale(string $locale): array
    {
        $version = self::jsonFileVersion($locale);

        return Cache::remember("translations.{$locale}.{$version}", 3600, function () use ($locale) {
            // Always start from English as the base (fallback for all untranslated keys)
            $result = self::loadJsonFile('en');

            // Overlay the requested locale's JSON file (if different from English)
            if ($locale !== 'en') {
                $localeDefaults = self::loadJsonFile($locale);
                if (! empty($localeDefaults)) {
                    $result = array_merge($result, $localeDefaults);
                }
            }

            // Overlay DB overrides for this locale
            $overrides = Translation::query()
                ->where('locale', $locale)
                ->where('group', '')
                ->pluck('value', 'key')
                ->all();

            return array_merge($result, $overrides);
        });
    }

    /**
     * Clear cached translations for a locale (or all locales).
     */
    public static function bustCache(?string $locale = null): void
    {
        if ($locale) {
            Cache::forget("translations.{$locale}.".self::jsonFileVersion($locale));
        } else {
            // Clear DB locale caches
            $locales = Translation::query()->distinct()->pluck('locale')->all();
            foreach ($locales as $loc) {
                Cache::forget("translations.{$loc}.".self::jsonFileVersion($loc));
            }
            // Also clear caches for active languages (may have JSON-only translations)
            $activeCodes = Language::query()->where('is_active', true)->pluck('code')->all();
            foreach ($activeCodes as $code) {
                Cache::forget("translations.{$code}.".self::jsonFileVersion($code));
            }
            Cache::forget('translations.en.'.self::jsonFileVersion('en'));
        }
    }

    /**
     * Get all known translation keys from the English JSON file.
     *
     * @return array<int, string>
     */
    public static function allKeys(): array
    {
        $defaults = self::loadJsonFile('en');

        return array_keys($defaults);
    }

    /**
     * Get only the JSON file defaults for a locale (no English fallback, no DB overrides).
     * Used by the translation editor to show per-locale base values.
     *
     * @return array<string, string>
     */
    public static function getJsonDefaults(string $locale): array
    {
        return self::loadJsonFile($locale);
    }

    /**
     * @return array<string, string>
     */
    private static function loadJsonFile(string $locale): array
    {
        if (! self::isValidLocale($locale)) {
            return [];
        }

        $langDirectory = realpath(lang_path());

        if ($langDirectory === false) {
            return [];
        }

        $path = $langDirectory.DIRECTORY_SEPARATOR.$locale.'.json';

        if (! file_exists($path)) {
            return [];
        }

        $resolvedPath = realpath($path);

        if ($resolvedPath === false || ! str_starts_with($resolvedPath, $langDirectory.DIRECTORY_SEPARATOR)) {
            return [];
        }

        $contents = file_get_contents($resolvedPath);

        if ($contents === false) {
            return [];
        }

        return json_decode($contents, true) ?: [];
    }

    private static function isValidLocale(string $locale): bool
    {
        return $locale !== '' && strlen($locale) <= 10 && preg_match(Language::LOCALE_REGEX, $locale);
    }

    /**
     * Fingerprint of the en.json + locale.json mtimes. A deploy that edits
     * either file changes this, which changes the cache key above — so newly
     * added/changed keys are picked up immediately instead of waiting out the
     * hour-long TTL or requiring someone to call bustCache() by hand.
     */
    private static function jsonFileVersion(string $locale): string
    {
        $langDirectory = realpath(lang_path());

        if ($langDirectory === false) {
            return '0';
        }

        $mtimes = [];

        foreach (array_unique(['en', $locale]) as $loc) {
            $path = $langDirectory.DIRECTORY_SEPARATOR.$loc.'.json';
            $mtimes[] = file_exists($path) ? (string) filemtime($path) : '0';
        }

        return implode('-', $mtimes);
    }
}
