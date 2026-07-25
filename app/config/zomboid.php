<?php

return [
    /*
    |--------------------------------------------------------------------------
    | RCON Configuration
    |--------------------------------------------------------------------------
    */
    'rcon' => [
        'host' => env('PZ_RCON_HOST', 'game-server'),
        'port' => (int) env('PZ_RCON_PORT', 27015),
        'password' => env('PZ_RCON_PASSWORD', ''),
        'timeout' => (int) env('PZ_RCON_TIMEOUT', 5),
    ],

    /*
    |--------------------------------------------------------------------------
    | Docker Engine API
    |--------------------------------------------------------------------------
    */
    'docker' => [
        'proxy_url' => env('DOCKER_PROXY_URL', 'http://docker-socket-proxy:2375'),
        'container_name' => env('GAME_SERVER_CONTAINER_NAME', 'pz-game-server'),
    ],

    /*
    |--------------------------------------------------------------------------
    | PZ Server Paths (inside app container)
    |--------------------------------------------------------------------------
    */
    'paths' => [
        'data' => env('PZ_DATA_PATH', '/pz-data'),
        'server_ini' => env('PZ_DATA_PATH', '/pz-data').'/Server/'.env('PZ_SERVER_NAME', 'ZomboidServer').'.ini',
        'sandbox_lua' => env('PZ_DATA_PATH', '/pz-data').'/Server/'.env('PZ_SERVER_NAME', 'ZomboidServer').'_SandboxVars.lua',
        'db' => env('PZ_DATA_PATH', '/pz-data').'/db/serverPZ.db',
        // PZ sanitizes the save directory name (spaces become underscores), unlike
        // the Server/ config files which keep the raw server name.
        'players_db' => env('PZ_DATA_PATH', '/pz-data').'/Saves/Multiplayer/'.str_replace(' ', '_', env('PZ_SERVER_NAME', 'ZomboidServer')).'/players.db',
        // Downloaded Workshop items live here, one directory per Workshop ID,
        // each with a mods/<ModName>/mod.info per internal mod it bundles.
        'workshop_content' => env('PZ_SERVER_PATH', '/pz-server').'/steamapps/workshop/content/108600',
    ],

    /*
    |--------------------------------------------------------------------------
    | Steam Branch
    |--------------------------------------------------------------------------
    */
    'steam_branch' => env('PZ_STEAM_BRANCH', 'unstable'),

    /*
    |--------------------------------------------------------------------------
    | Map Tile Configuration
    |--------------------------------------------------------------------------
    */
    'game_server_path' => env('PZ_SERVER_PATH', '/pz-server'),

    'map' => [
        'tiles_path' => env('PZ_MAP_TILES_PATH', '/map-tiles'),
        'status_path' => storage_path('app/map-tile-status.json'),
        'generation_timeout' => (int) env('PZ_MAP_GENERATION_TIMEOUT', 28800),
        'tile_size' => 256,
        'min_zoom' => 13,
        'max_zoom' => 17,
        'default_zoom' => 13,
        'center_x' => 10500.0,
        'center_y' => 9800.0,
        'proxy_url' => env('PZ_MAP_PROXY_URL', 'https://map.projectzomboid.com/maps/42.19.0/base/layer0_files/{z}/{x}_{y}.jpg'),
        'proxy_tile_size' => 1024,
        // The official B42 pyramid omits its full-resolution level (`skip: 1`).
        // These projection values are therefore half of map_info.json's x0,
        // y0, and sqr values and match layer0.dzi's actual pixel dimensions.
        'proxy_dzi' => [
            'width' => 1157216,
            'height' => 509520,
            'x0' => 518144,
            'y0' => -69648,
            'sqr' => 64,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Server Identity
    |--------------------------------------------------------------------------
    */
    'server_name' => env('PZ_SERVER_NAME', 'ZomboidServer'),

    // On-disk name of the Saves/Multiplayer/<name> directory. PZ sanitizes it
    // (spaces become underscores); Server/*.ini and db/*.db keep the raw name.
    'save_name' => str_replace(' ', '_', env('PZ_SERVER_NAME', 'ZomboidServer')),

    /*
    |--------------------------------------------------------------------------
    | Backup Configuration
    |--------------------------------------------------------------------------
    */
    'backups' => [
        'path' => env('BACKUP_PATH', '/backups'),
        'retention' => [
            'manual' => (int) env('BACKUP_RETENTION_MANUAL', 10),
            'scheduled' => (int) env('BACKUP_RETENTION_SCHEDULED', 24),
            'daily' => (int) env('BACKUP_RETENTION_DAILY', 7),
            'pre_rollback' => (int) env('BACKUP_RETENTION_PRE_ROLLBACK', 5),
            'pre_update' => (int) env('BACKUP_RETENTION_PRE_UPDATE', 3),
            'pre_import' => (int) env('BACKUP_RETENTION_PRE_IMPORT', 3),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Lua Bridge — File-based communication with PZ Lua mod
    |--------------------------------------------------------------------------
    */
    'lua_bridge' => [
        'path' => env('LUA_BRIDGE_PATH', '/lua-bridge'),
        'inventory_dir' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/inventory',
        'delivery_queue' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/delivery_queue.json',
        'delivery_results' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/delivery_results.json',
        'players_live' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/players_live.json',
        'items_catalog' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/items_catalog.json',
        'game_state' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/game_state.json',
        'player_stats' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/player_stats.json',
        'respawn_config' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/respawn_config.json',
        'respawn_deaths' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/respawn_deaths.json',
        'respawn_resets' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/respawn_resets.json',
        'respawn_kicks' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/respawn_kicks.json',
        'safezone_config' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/safezone_config.json',
        'safezone_violations' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/safezone_violations.json',
        'pvp_kills' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/pvp_kills.json',
        'deposit_requests' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/deposit_requests.json',
        'deposit_results' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/deposit_results.json',
        'export_requests' => env('LUA_BRIDGE_PATH', '/lua-bridge').'/export_requests.json',
    ],

    /*
    |--------------------------------------------------------------------------
    | Money Deposit — In-game money to wallet conversion
    |--------------------------------------------------------------------------
    */
    'money_deposit' => [
        'money_value' => (int) env('PZ_MONEY_VALUE', 1),
        'stack_value' => (int) env('PZ_MONEY_STACK_VALUE', 10),
    ],

    /*
    |--------------------------------------------------------------------------
    | API Authentication
    |--------------------------------------------------------------------------
    */
    'api_key' => env('API_KEY', ''),

    /*
    |--------------------------------------------------------------------------
    | Initial Admin Account
    |--------------------------------------------------------------------------
    */
    'admin' => [
        'username' => env('ADMIN_USERNAME', ''),
        'email' => env('ADMIN_EMAIL', ''),
        'password' => env('ADMIN_PASSWORD', ''),
    ],
];
