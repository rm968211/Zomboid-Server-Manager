<?php

namespace App\Services;

final class ConfigMetadataParser
{
    /**
     * Build UI metadata from the comments and values in a server INI file.
     *
     * @return array<string, array<string, mixed>>
     */
    public function parseServerFile(string $path): array
    {
        $content = $this->readFile($path);

        return $content === null ? [] : $this->parseServerContent($content);
    }

    /**
     * Build UI metadata from the comments and values in a SandboxVars Lua file.
     *
     * @return array<string, array<string, mixed>>
     */
    public function parseSandboxFile(string $path): array
    {
        $content = $this->readFile($path);

        return $content === null ? [] : $this->parseSandboxContent($content);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function parseServerContent(string $content): array
    {
        $metadata = [];
        $comments = [];

        foreach (preg_split('/\r\n|\r|\n/', $content) ?: [] as $line) {
            $trimmed = trim($line);

            if (str_starts_with($trimmed, '#') || str_starts_with($trimmed, ';')) {
                $comments[] = $this->cleanComment(substr($trimmed, 1));

                continue;
            }

            if ($trimmed === '') {
                $comments = [];

                continue;
            }

            if (preg_match('/^([^=]+)=(.*)$/', $line, $matches) !== 1) {
                $comments = [];

                continue;
            }

            $key = trim($matches[1]);
            $rawValue = trim($matches[2]);
            $metadata[$key] = $this->buildMetadata($key, $rawValue, $comments, 'Other');
            $comments = [];
        }

        return $metadata;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function parseSandboxContent(string $content): array
    {
        $metadata = [];
        $comments = [];
        $path = [];

        foreach (preg_split('/\r\n|\r|\n/', $content) ?: [] as $line) {
            $trimmed = trim($line);

            if (str_starts_with($trimmed, '--')) {
                $comments[] = $this->cleanComment(substr($trimmed, 2));

                continue;
            }

            if ($trimmed === '') {
                $comments = [];

                continue;
            }

            if (preg_match('/^SandboxVars\s*=\s*\{\s*$/', $trimmed) === 1) {
                $comments = [];

                continue;
            }

            if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*,?\s*$/', $trimmed, $matches) === 1) {
                $path[] = $matches[1];
                $comments = [];

                continue;
            }

            if (preg_match('/^\}\s*,?\s*$/', $trimmed) === 1) {
                array_pop($path);
                $comments = [];

                continue;
            }

            if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*,?\s*$/', $trimmed, $matches) !== 1) {
                $comments = [];

                continue;
            }

            $keyParts = [...$path, $matches[1]];
            $key = implode('.', $keyParts);
            $rawValue = trim($matches[2]);
            $metadata[$key] = $this->buildMetadata(
                $key,
                $rawValue,
                $comments,
                $this->sandboxGroup($keyParts),
            );
            $comments = [];
        }

        return $metadata;
    }

    private function readFile(string $path): ?string
    {
        if (! is_file($path) || ! is_readable($path)) {
            return null;
        }

        $content = file_get_contents($path);

        return $content === false ? null : $content;
    }

    /**
     * @param  list<string>  $comments
     * @return array<string, mixed>
     */
    private function buildMetadata(string $key, string $rawValue, array $comments, string $group): array
    {
        $options = $this->extractOptions($comments);
        $value = $this->parseScalar($rawValue);
        $type = $this->inferType($value, $options);
        $metadata = [
            'type' => $type,
            'group' => $group,
            'description' => $this->extractDescription($comments),
        ];

        if ($options !== []) {
            $metadata['options'] = $options;
        }

        $min = $this->extractNumber($comments, 'Min');
        $max = $this->extractNumber($comments, 'Max');
        $default = $this->extractDefault($comments, $options);

        if ($min !== null) {
            $metadata['min'] = $min;
        }

        if ($max !== null) {
            $metadata['max'] = $max;
        }

        if ($default !== null) {
            $metadata['default'] = $default;
        }

        if ($type === 'number') {
            $metadata['step'] = $this->inferNumberStep($rawValue, $comments);
        }

        return $metadata;
    }

    private function cleanComment(string $comment): string
    {
        return trim(preg_replace('/\s+/', ' ', trim($comment)) ?? trim($comment));
    }

    /**
     * @param  list<string>  $comments
     * @return list<array{value: string, label: string}>
     */
    private function extractOptions(array $comments): array
    {
        $options = [];

        foreach ($comments as $comment) {
            if (preg_match('/^(-?\d+)\s*=\s*(.+)$/', $comment, $matches) === 1) {
                $this->addOption($options, $matches[1], $matches[2]);

                continue;
            }

            preg_match_all(
                '/(?:^|[,;]\s*|\s)(-?\d+)\s*(?:=|-)\s*(.*?)(?=(?:[,;]\s*|\s)-?\d+\s*(?:=|-)|$)/',
                $comment,
                $matches,
                PREG_SET_ORDER,
            );

            if (count($matches) < 2) {
                continue;
            }

            foreach ($matches as $match) {
                $this->addOption($options, $match[1], $match[2]);
            }
        }

        return count($options) >= 2 ? array_values($options) : [];
    }

    /**
     * @param  array<string, array{value: string, label: string}>  $options
     */
    private function addOption(array &$options, string $value, string $label): void
    {
        $label = preg_replace(
            '/\s+\b(?:Min|Max|Default)\s*[:=].*$/i',
            '',
            $label,
        ) ?? $label;
        $label = trim($label, " \t\n\r\0\x0B,;.");

        if ($label === '') {
            return;
        }

        $options[$value] = [
            'value' => $value,
            'label' => $label,
        ];
    }

    /**
     * @param  list<string>  $comments
     */
    private function extractDescription(array $comments): string
    {
        $description = [];

        foreach ($comments as $comment) {
            if (preg_match('/^-?\d+\s*=\s*.+$/', $comment) === 1) {
                continue;
            }

            $line = $comment;

            if ($this->extractOptions([$comment]) !== []) {
                $line = preg_replace(
                    '/(?:^|\s)-?\d+\s*(?:=|-)\s*.*$/',
                    '',
                    $line,
                ) ?? $line;
            }

            $line = preg_replace('/\s*\bMin:\s*-?\d+(?:\.\d+)?/i', '', $line) ?? $line;
            $line = preg_replace('/\s*\bMax:\s*-?\d+(?:\.\d+)?/i', '', $line) ?? $line;
            $line = preg_replace('/\s*\bDefault\s*[:=]\s*.+$/i', '', $line) ?? $line;
            $line = trim($line);

            if ($line !== '' && ! in_array($line, $description, true)) {
                $description[] = $line;
            }
        }

        return implode(' ', $description);
    }

    /**
     * @param  list<string>  $comments
     */
    private function extractNumber(array $comments, string $name): int|float|null
    {
        $text = implode("\n", $comments);

        if (preg_match('/\b'.preg_quote($name, '/').':\s*(-?\d+(?:\.\d+)?)/i', $text, $matches) !== 1) {
            return null;
        }

        return $this->parseNumber($matches[1]);
    }

    /**
     * @param  list<string>  $comments
     * @param  list<array{value: string, label: string}>  $options
     */
    private function extractDefault(array $comments, array $options): string|int|float|bool|null
    {
        foreach ($comments as $comment) {
            if (preg_match('/\bDefault\s*[:=]\s*(.+?)(?=\s+\b(?:Min|Max):|$)/i', $comment, $matches) !== 1) {
                continue;
            }

            $default = trim($matches[1], " \t\n\r\0\x0B.");

            foreach ($options as $option) {
                if (strcasecmp($option['label'], $default) === 0) {
                    return $option['value'];
                }
            }

            return $this->parseScalar($default);
        }

        return null;
    }

    /**
     * @param  list<array{value: string, label: string}>  $options
     */
    private function inferType(mixed $value, array $options): string
    {
        if ($options !== [] && (is_int($value) || is_float($value) || is_string($value))) {
            return 'enum';
        }

        if (is_bool($value)) {
            return 'boolean';
        }

        if (is_int($value) || is_float($value)) {
            return 'number';
        }

        return 'string';
    }

    private function parseScalar(string $rawValue): string|int|float|bool
    {
        $value = trim($rawValue);

        if (
            strlen($value) >= 2
            && (($value[0] === '"' && $value[-1] === '"') || ($value[0] === "'" && $value[-1] === "'"))
        ) {
            return stripcslashes(substr($value, 1, -1));
        }

        if (strcasecmp($value, 'true') === 0) {
            return true;
        }

        if (strcasecmp($value, 'false') === 0) {
            return false;
        }

        if (preg_match('/^-?\d+$/', $value) === 1) {
            return (int) $value;
        }

        if (preg_match('/^-?(?:\d+\.\d*|\d*\.\d+)$/', $value) === 1) {
            return (float) $value;
        }

        return $value;
    }

    private function parseNumber(string $value): int|float
    {
        return str_contains($value, '.') ? (float) $value : (int) $value;
    }

    /**
     * @param  list<string>  $comments
     */
    private function inferNumberStep(string $rawValue, array $comments): int|float
    {
        $precision = 0;

        foreach ([$rawValue, ...$comments] as $candidate) {
            preg_match_all('/-?\d+\.(\d+)/', $candidate, $matches);

            foreach ($matches[1] as $decimals) {
                $precision = max($precision, strlen($decimals));
            }
        }

        if ($precision === 0) {
            return 1;
        }

        return 10 ** (-min($precision, 4));
    }

    /**
     * @param  list<string>  $keyParts
     */
    private function sandboxGroup(array $keyParts): string
    {
        if (count($keyParts) === 1) {
            return 'Advanced Sandbox';
        }

        return match ($keyParts[0]) {
            'ZombieLore' => 'Zombie Lore',
            'ZombieConfig' => 'Zombie Population',
            'MultiplierConfig' => 'Skill XP Multipliers',
            'Map' => 'Map',
            'Basement' => 'World',
            default => $this->humanize($keyParts[0]),
        };
    }

    private function humanize(string $value): string
    {
        $value = preg_replace('/(?<=[a-z0-9])(?=[A-Z])/', ' ', $value) ?? $value;

        return ucfirst(str_replace('_', ' ', $value));
    }
}
