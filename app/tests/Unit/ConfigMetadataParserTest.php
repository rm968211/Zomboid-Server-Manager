<?php

use App\Services\ConfigMetadataParser;

beforeEach(function () {
    $this->parser = new ConfigMetadataParser;
});

it('derives complete server setting metadata from INI comments and values', function () {
    $content = <<<'INI'
# Number of players that may be connected simultaneously.
# Min: 1 Max: 100 Default: 32
MaxPlayers=16
# Show the server in the public browser. Default: true
Public=true
# Controls remote player visibility. 1=Hidden 2=Friends 3=Everyone Min: 1 Max: 3 Default: 1
MapRemotePlayerVisibility=2
INI;

    $metadata = $this->parser->parseServerContent($content);

    expect($metadata)->toHaveKeys([
        'MaxPlayers',
        'Public',
        'MapRemotePlayerVisibility',
    ])
        ->and($metadata['MaxPlayers'])
        ->toMatchArray([
            'type' => 'number',
            'description' => 'Number of players that may be connected simultaneously.',
            'min' => 1,
            'max' => 100,
            'default' => 32,
            'step' => 1,
        ])
        ->and($metadata['Public'])
        ->toMatchArray([
            'type' => 'boolean',
            'description' => 'Show the server in the public browser.',
            'default' => true,
        ])
        ->and($metadata['MapRemotePlayerVisibility']['type'])->toBe('enum')
        ->and($metadata['MapRemotePlayerVisibility']['description'])
        ->toBe('Controls remote player visibility.')
        ->and($metadata['MapRemotePlayerVisibility']['min'])->toBe(1)
        ->and($metadata['MapRemotePlayerVisibility']['max'])->toBe(3)
        ->and($metadata['MapRemotePlayerVisibility']['default'])->toBe(1)
        ->and($metadata['MapRemotePlayerVisibility']['options'])->toBe([
            ['value' => '1', 'label' => 'Hidden'],
            ['value' => '2', 'label' => 'Friends'],
            ['value' => '3', 'label' => 'Everyone'],
        ]);
});

it('derives sandbox enums, booleans, numeric ranges, and nested groups', function () {
    $content = <<<'LUA'
SandboxVars = {
    -- How zombies are distributed. Default = Urban Focused
    -- 1 = Urban Focused
    -- 2 = Uniform
    Distribution = 1,
    -- Whether fire can spread. Default: true
    FireSpread = true,
    ZombieConfig = {
        -- Governs the overall zombie population. Min: 0.00 Max: 4.00 Default: 1.00
        PopulationMultiplier = 1.0,
    },
    MultiplierConfig = {
        -- Experience multiplier for the Axe skill. Min: 0.01 Max: 1000.00 Default: 1.00
        Axe = 1.0,
    },
}
LUA;

    $metadata = $this->parser->parseSandboxContent($content);

    expect($metadata)->toHaveKeys([
        'Distribution',
        'FireSpread',
        'ZombieConfig.PopulationMultiplier',
        'MultiplierConfig.Axe',
    ])
        ->and($metadata['Distribution']['type'])->toBe('enum')
        ->and($metadata['Distribution']['default'])->toBe('1')
        ->and($metadata['Distribution']['options'])->toBe([
            ['value' => '1', 'label' => 'Urban Focused'],
            ['value' => '2', 'label' => 'Uniform'],
        ])
        ->and($metadata['FireSpread']['type'])->toBe('boolean')
        ->and($metadata['ZombieConfig.PopulationMultiplier'])
        ->toMatchArray([
            'type' => 'number',
            'group' => 'Zombie Population',
            'min' => 0.0,
            'max' => 4.0,
            'default' => 1.0,
            'step' => 0.01,
        ])
        ->and($metadata['MultiplierConfig.Axe']['group'])
        ->toBe('Skill XP Multipliers');
});

it('returns metadata for every setting even when the source has no comment', function () {
    $server = $this->parser->parseServerContent("Password=\nPublic=true\n");
    $sandbox = $this->parser->parseSandboxContent(
        "SandboxVars = {\n    Zombies = 4,\n    Map = {\n        AllowMiniMap = false,\n    },\n}\n",
    );

    expect($server)->toHaveCount(2)
        ->and($server['Password']['type'])->toBe('string')
        ->and($server['Password']['description'])->toBe('')
        ->and($sandbox)->toHaveCount(2)
        ->and($sandbox['Zombies']['type'])->toBe('number')
        ->and($sandbox['Map.AllowMiniMap'])
        ->toMatchArray([
            'type' => 'boolean',
            'group' => 'Map',
            'description' => '',
        ]);
});

it('returns empty metadata when a config file is unavailable', function () {
    expect($this->parser->parseServerFile('/missing/server.ini'))->toBe([])
        ->and($this->parser->parseSandboxFile('/missing/SandboxVars.lua'))->toBe([]);
});
