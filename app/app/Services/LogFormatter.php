<?php

namespace App\Services;

/**
 * Turns raw docker log lines from the game server into structured entries for
 * the log viewer: local-time-ready ISO timestamp, level, source, message, and
 * indented continuation lines (java stack traces) folded into the entry above.
 */
class LogFormatter
{
    /** Docker's `timestamps=true` prefix, e.g. 2026-07-30T17:04:06.200639358Z */
    private const TIMESTAMP = '/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?\d*(Z|[+-]\d{2}:?\d{2})\s?/';

    /** `LOG  : ` / `WARN : ` / `ERROR: ` / steamcmd's `WARNING: ` */
    private const LEVEL = '/^(LOG|WARN|WARNING|ERROR|DEBUG|TRACE|INFO)\s*:\s*/';

    /** PZ noise after the level: `General      f:0 st:2,312,409,196>` or `... at IsoSpriteManager.AddSprite  >` */
    private const PZ_PREFIX = '/^(\w+)\s+f:\d+\s+st:[\d,]+\s*(?:at\s+(\S.*?)\s*)?>\s*/';

    /**
     * @param  string[]  $rawLines
     * @return list<array{time: ?string, level: string, source: ?string, message: string, details: list<string>}>
     */
    public function format(array $rawLines): array
    {
        $entries = [];

        foreach ($rawLines as $raw) {
            $line = preg_replace('/\e\[[0-9;]*[a-zA-Z]/', '', rtrim($raw, "\r\n"));

            $time = null;
            if (preg_match(self::TIMESTAMP, $line, $m)) {
                $time = $m[1].($m[2] ?? '').'Z';
                $line = (string) preg_replace(self::TIMESTAMP, '', $line);
            }

            if (trim($line) === '') {
                continue;
            }

            // Indented lines continue the entry above them (stack traces, "Caused by:").
            if ($entries !== [] && ltrim($line) !== $line) {
                $entries[count($entries) - 1]['details'][] = rtrim($line);

                continue;
            }

            $level = 'info';
            $source = null;

            if (preg_match(self::LEVEL, $line, $m)) {
                $level = strtolower($m[1]) === 'warning' ? 'warn' : strtolower($m[1]);
                $line = (string) preg_replace(self::LEVEL, '', $line);

                if (preg_match(self::PZ_PREFIX, $line, $pz)) {
                    $source = $pz[1];
                    $line = (string) preg_replace(self::PZ_PREFIX, '', $line);

                    // `at Foo.Bar >` is where the message came from — keep it, inline.
                    if (($pz[2] ?? '') !== '') {
                        $line = $pz[2].': '.$line;
                    }
                }
            }

            $entries[] = [
                'time' => $time,
                'level' => $level,
                'source' => $source,
                'message' => trim($line),
                'details' => [],
            ];
        }

        return $entries;
    }
}
