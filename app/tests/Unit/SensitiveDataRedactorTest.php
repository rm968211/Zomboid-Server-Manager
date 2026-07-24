<?php

use App\Support\SensitiveDataRedactor;

it('redacts sensitive values recursively', function () {
    $redacted = SensitiveDataRedactor::redact([
        'settings' => [
            'Password' => 'server-password',
            'AdminPassword' => 'admin-password',
            'nested' => [
                'api_key' => 'api-secret',
                'MaxPlayers' => 16,
            ],
        ],
        'name' => 'ZomboidServer',
    ]);

    expect($redacted)->toBe([
        'settings' => [
            'Password' => '[REDACTED]',
            'AdminPassword' => '[REDACTED]',
            'nested' => [
                'api_key' => '[REDACTED]',
                'MaxPlayers' => 16,
            ],
        ],
        'name' => 'ZomboidServer',
    ]);
});
