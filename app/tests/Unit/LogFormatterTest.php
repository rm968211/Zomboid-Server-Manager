<?php

use App\Services\LogFormatter;

it('strips the docker timestamp and PZ counters from a log line', function () {
    $entries = (new LogFormatter)->format([
        '2026-07-30T17:03:46.254106303Z LOG  : Mod          f:0 st:2,312,389,245> loading ZomboidManager',
    ]);

    expect($entries)->toHaveCount(1)
        ->and($entries[0]['time'])->toBe('2026-07-30T17:03:46.254Z')
        ->and($entries[0]['level'])->toBe('log')
        ->and($entries[0]['source'])->toBe('Mod')
        ->and($entries[0]['message'])->toBe('loading ZomboidManager')
        ->and($entries[0]['details'])->toBe([]);
});

it('keeps the originating function from an "at Foo >" prefix', function () {
    $entries = (new LogFormatter)->format([
        '2026-07-30T17:03:57.598Z WARN : Lua          f:0 st:2,312,400,589 at Lua(Vanilla).corpseStorageCheck.lua > require("ISUI/ISVehicleMenu") failed',
    ]);

    expect($entries[0]['level'])->toBe('warn')
        ->and($entries[0]['source'])->toBe('Lua')
        ->and($entries[0]['message'])->toBe('Lua(Vanilla).corpseStorageCheck.lua: require("ISUI/ISVehicleMenu") failed');
});

it('folds indented stack trace lines into the entry above', function () {
    $entries = (new LogFormatter)->format([
        '2026-07-30T17:04:06.205688949Z ERROR: General      f:0 st:2,312,409,196> AnimNode.Parse> Exception thrown',
        "2026-07-30T17:04:06.205698937Z \tzombie.util.PZXmlParserException: Exception thrown",
        "2026-07-30T17:04:06.205713324Z \tStack trace:",
        "2026-07-30T17:04:06.205726594Z \t\tzombie.network.GameServer.main(GameServer.java:878)",
    ]);

    expect($entries)->toHaveCount(1)
        ->and($entries[0]['level'])->toBe('error')
        ->and($entries[0]['message'])->toBe('AnimNode.Parse> Exception thrown')
        ->and($entries[0]['details'])->toHaveCount(3);
});

it('strips ANSI colour codes and drops blank lines', function () {
    $entries = (new LogFormatter)->format([
        "2026-07-30T17:00:00.000000000Z \e[0m\e[1mapp_update 380870 -beta public validate",
        '2026-07-30T17:00:00.100000000Z ',
    ]);

    expect($entries)->toHaveCount(1)
        ->and($entries[0]['level'])->toBe('info')
        ->and($entries[0]['source'])->toBeNull()
        ->and($entries[0]['message'])->toBe('app_update 380870 -beta public validate');
});

it('handles lines with no docker timestamp and steamcmd WARNING levels', function () {
    $entries = (new LogFormatter)->format([
        'WARNING: setlocale: LC_ALL: cannot change locale',
    ]);

    expect($entries[0]['time'])->toBeNull()
        ->and($entries[0]['level'])->toBe('warn')
        ->and($entries[0]['message'])->toBe('setlocale: LC_ALL: cannot change locale');
});
