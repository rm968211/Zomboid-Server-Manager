<?php

namespace App\Support;

class SensitiveDataRedactor
{
    private const REDACTED = '[REDACTED]';

    /**
     * Recursively redact credentials while preserving the shape of audit data.
     *
     * @param  array<string|int, mixed>  $data
     * @return array<string|int, mixed>
     */
    public static function redact(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_string($key) && self::isSensitiveKey($key)) {
                $data[$key] = self::REDACTED;

                continue;
            }

            if (is_array($value)) {
                $data[$key] = self::redact($value);
            }
        }

        return $data;
    }

    private static function isSensitiveKey(string $key): bool
    {
        $normalized = strtolower(preg_replace('/[^a-z0-9]/i', '', $key) ?? $key);

        return str_contains($normalized, 'password')
            || str_contains($normalized, 'secret')
            || str_contains($normalized, 'token')
            || str_contains($normalized, 'apikey')
            || str_contains($normalized, 'recoverycode');
    }
}
