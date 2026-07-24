export type SettingMeta = {
    type: 'boolean' | 'number' | 'string' | 'enum' | 'list';
    group: string;
    description: string;
    default?: string | number | boolean;
    sensitive?: boolean;
    readOnly?: boolean;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
};

// ── Server.ini settings ─────────────────────────────────────────────

export const SERVER_INI_META: Record<string, SettingMeta> = {
    // General
    ServerName: {
        type: 'string',
        group: 'General',
        description:
            'The name of the server as it appears in the server browser.',
        default: 'servertest',
    },
    PublicName: {
        type: 'string',
        group: 'General',
        description:
            'Name of the server displayed in the in-game browser and, if applicable, the Steam browser.',
    },
    PublicDescription: {
        type: 'string',
        group: 'General',
        description:
            'Description displayed in the in-game public server browser.',
    },
    Public: {
        type: 'boolean',
        group: 'General',
        description:
            'Whether the server is visible in the public server browser. Steam-enabled servers are always visible in the Steam server browser.',
        default: true,
    },
    Open: {
        type: 'boolean',
        group: 'General',
        description:
            'Allow new players to join. Set to false to only allow whitelisted players.',
        default: true,
    },
    AutoCreateUserInWhiteList: {
        type: 'boolean',
        group: 'General',
        description:
            'Automatically store player credentials when they join. Required for web login sync.',
        default: true,
    },
    PauseEmpty: {
        type: 'boolean',
        group: 'General',
        description: 'Pause the server when no players are connected.',
        default: true,
    },
    Password: {
        type: 'string',
        group: 'General',
        description:
            'Password required to join the server. Leave empty for no password.',
        sensitive: true,
    },
    AdminPassword: {
        type: 'string',
        group: 'General',
        description: 'Password for in-game admin access.',
        sensitive: true,
    },
    ServerWelcomeMessage: {
        type: 'string',
        group: 'General',
        description:
            'Welcome message shown in the chat panel after a player logs in. Supports <RGB:r,g,b> colours and <LINE> for line breaks.',
    },
    MaxAccountsPerUser: {
        type: 'number',
        group: 'General',
        description:
            'Limits the number of different accounts a single Steam user may create on this server (0 = unlimited).',
        default: 0,
        min: 0,
    },
    DropOffWhiteListAfterDeath: {
        type: 'boolean',
        group: 'General',
        description:
            'Remove player accounts from the whitelist after death. Prevents players creating a new character after death on Open=false servers.',
        default: false,
    },
    AllowNonAsciiUsername: {
        type: 'boolean',
        group: 'General',
        description:
            'Allow use of non-ASCII (cyrillic etc.) characters in usernames.',
        default: false,
    },
    AllowCoop: {
        type: 'boolean',
        group: 'General',
        description: 'Allow co-op/splitscreen players.',
        default: true,
    },
    DenyLoginOnOverloadedServer: {
        type: 'boolean',
        group: 'General',
        description: 'Deny new logins while the server is overloaded.',
        default: true,
    },
    LoginQueueEnabled: {
        type: 'boolean',
        group: 'General',
        description: 'Enable a login queue when the server is full.',
        default: false,
    },
    LoginQueueConnectTimeout: {
        type: 'number',
        group: 'General',
        description:
            'Seconds a queued player has to connect before losing their place in the login queue.',
        default: 60,
        min: 20,
        max: 1200,
    },

    // Network
    DefaultPort: {
        type: 'number',
        group: 'Network',
        description: 'Primary game server port (TCP/UDP).',
        default: 16261,
        min: 1024,
        max: 65535,
    },
    UDPPort: {
        type: 'number',
        group: 'Network',
        description: 'Secondary UDP port for game traffic.',
        default: 16262,
        min: 1024,
        max: 65535,
    },
    RCONPort: {
        type: 'number',
        group: 'Network',
        description: 'RCON (remote console) port for server management.',
        default: 27015,
        min: 1024,
        max: 65535,
    },
    RCONPassword: {
        type: 'string',
        group: 'Network',
        description: 'Password for RCON connections.',
        sensitive: true,
    },
    UPnP: {
        type: 'boolean',
        group: 'Network',
        description:
            'Attempt to configure a UPnP-enabled internet gateway to automatically set up port forwarding. Falls back to default ports if this fails.',
        default: true,
    },
    server_browser_announced_ip: {
        type: 'string',
        group: 'Network',
        description:
            'The IP from which the server is broadcast, for network configurations with multiple IP addresses.',
    },
    PingLimit: {
        type: 'number',
        group: 'Network',
        description:
            'Ping limit in milliseconds before a player is kicked (0 = disabled).',
        default: 0,
        min: 0,
    },
    MaxPacketsPerSecond: {
        type: 'number',
        group: 'Network',
        description: 'Maximum network packets per second per client.',
        default: 300,
        min: 100,
        max: 1000,
    },
    MultiplayerStatisticsPeriod: {
        type: 'number',
        group: 'Network',
        description:
            'Multiplayer statistics update period in seconds (0 = statistics disabled).',
        default: 1,
        min: 0,
        max: 10,
    },
    SwitchZombiesOwnershipEachUpdate: {
        type: 'boolean',
        group: 'Network',
        description:
            'Reassign zombie simulation ownership between clients on each update. Affects multiplayer zombie sync behavior.',
        default: false,
    },

    // Players
    MaxPlayers: {
        type: 'number',
        group: 'Players',
        description:
            'Maximum number of players allowed on the server, excluding admins. Counts above 32 may cause poor map streaming and desync.',
        default: 16,
        min: 1,
        max: 100,
    },
    DisplayUserName: {
        type: 'boolean',
        group: 'Players',
        description: "Display usernames above players' heads in-game.",
        default: true,
    },
    ShowFirstAndLastName: {
        type: 'boolean',
        group: 'Players',
        description: "Display first and last name above players' heads.",
        default: false,
    },
    MouseOverToSeeDisplayName: {
        type: 'boolean',
        group: 'Players',
        description:
            'Players must mouse over someone to see their display name.',
        default: true,
    },
    HidePlayersBehindYou: {
        type: 'boolean',
        group: 'Players',
        description: "Automatically hide players you can't see (like zombies).",
        default: true,
    },
    UsernameDisguises: {
        type: 'boolean',
        group: 'Players',
        description:
            'Allow players to disguise their displayed username using the disguise system.',
        default: false,
    },
    HideDisguisedUserName: {
        type: 'boolean',
        group: 'Players',
        description: 'Hide the username of disguised players.',
        default: false,
    },
    SpawnPoint: {
        type: 'string',
        group: 'Players',
        description:
            'Force every new player to spawn at these x,y,z world coordinates (ignored when 0,0,0). Find coordinates at map.projectzomboid.com.',
        default: '0,0,0',
    },
    SpawnItems: {
        type: 'string',
        group: 'Players',
        description:
            'Item types new players spawn with, comma-separated. Example: Base.Axe,Base.Bag_BigHikingBag',
    },
    PlayerRespawnWithSelf: {
        type: 'boolean',
        group: 'Players',
        description:
            'Players can respawn in-game at the coordinates where they died.',
        default: false,
    },
    PlayerRespawnWithOther: {
        type: 'boolean',
        group: 'Players',
        description:
            "Players can respawn in-game at a split screen / Remote Play player's location.",
        default: false,
    },
    PlayerBumpPlayer: {
        type: 'boolean',
        group: 'Players',
        description:
            'Players bump (and knock over) other players when running through them.',
        default: false,
    },
    SleepAllowed: {
        type: 'boolean',
        group: 'Players',
        description:
            'Players are allowed to sleep when tired, but do not need to sleep.',
        default: false,
    },
    SleepNeeded: {
        type: 'boolean',
        group: 'Players',
        description:
            'Players get tired and need to sleep (ignored if SleepAllowed is false).',
        default: false,
    },
    KnockedDownAllowed: {
        type: 'boolean',
        group: 'Players',
        description:
            'WIP: allow players to be knocked down. May cause visual desynchronization of player positions.',
        default: false,
    },
    SneakModeHideFromOtherPlayers: {
        type: 'boolean',
        group: 'Players',
        description: 'Sneaking players are hidden from other players.',
        default: true,
    },
    FastForwardMultiplier: {
        type: 'number',
        group: 'Players',
        description: 'How fast time passes while players sleep.',
        default: 40.0,
        min: 1,
        max: 100,
    },
    UltraSpeedDoesnotAffectToAnimals: {
        type: 'boolean',
        group: 'Players',
        description:
            'Fast-forwarding time (ultra speed) does not speed up animals.',
        default: false,
    },
    MapRemotePlayerVisibility: {
        type: 'enum',
        group: 'Players',
        description: 'Controls display of remote players on the in-game map.',
        default: 1,
        options: [
            { value: '1', label: 'Hidden' },
            { value: '2', label: 'Friends' },
            { value: '3', label: 'Friends and Nearby Players' },
            { value: '4', label: 'Everyone' },
        ],
    },
    SteamScoreboard: {
        type: 'boolean',
        group: 'Players',
        description: 'Show Steam usernames and avatars in the Players list.',
        default: true,
    },
    DisableScoreboard: {
        type: 'boolean',
        group: 'Players',
        description: 'Disable the scoreboard.',
        default: false,
    },
    HideAdminsInPlayerList: {
        type: 'boolean',
        group: 'Players',
        description: 'Hide admins in the player list.',
        default: false,
    },

    // PVP
    PVP: {
        type: 'boolean',
        group: 'PVP',
        description: 'Players can hurt and kill other players.',
        default: true,
    },
    PVPLogToolChat: {
        type: 'boolean',
        group: 'PVP',
        description: 'PVP is logged to admin chat.',
        default: true,
    },
    PVPLogToolFile: {
        type: 'boolean',
        group: 'PVP',
        description: 'PVP is logged to file.',
        default: true,
    },
    SafetySystem: {
        type: 'boolean',
        group: 'PVP',
        description:
            'Players can enter and leave PVP mode individually. A player can only hurt another when at least one of them is in PVP mode. When false, players can hurt each other any time if PVP is enabled.',
        default: true,
    },
    ShowSafety: {
        type: 'boolean',
        group: 'PVP',
        description:
            'Display a skull icon over the head of players who have entered PVP mode.',
        default: true,
    },
    SafetyToggleTimer: {
        type: 'number',
        group: 'PVP',
        description:
            'The time it takes for a player to enter and leave PVP mode.',
        default: 2,
        min: 0,
        max: 1000,
    },
    SafetyCooldownTimer: {
        type: 'number',
        group: 'PVP',
        description:
            'The delay before a player can enter or leave PVP mode again, having recently done so.',
        default: 3,
        min: 0,
        max: 1000,
    },
    SafetyDisconnectDelay: {
        type: 'number',
        group: 'PVP',
        description:
            'Delay in seconds applied when a player in PVP mode disconnects.',
        default: 60,
        min: 0,
        max: 60,
    },
    PVPMeleeWhileHitReaction: {
        type: 'boolean',
        group: 'PVP',
        description:
            'Players can hit again while reacting to being struck by another player.',
        default: false,
    },
    PVPMeleeDamageModifier: {
        type: 'number',
        group: 'PVP',
        description: 'Damage multiplier for PVP melee attacks.',
        default: 30.0,
        min: 0,
        max: 500,
    },
    PVPFirearmDamageModifier: {
        type: 'number',
        group: 'PVP',
        description: 'Damage multiplier for PVP ranged attacks.',
        default: 50.0,
        min: 0,
        max: 500,
    },
    UsePhysicsHitReaction: {
        type: 'boolean',
        group: 'PVP',
        description:
            'Use physics-based (ragdoll) hit reactions when players are hit.',
        default: false,
    },
    War: {
        type: 'boolean',
        group: 'PVP',
        description:
            'Enable the faction war system, allowing factions to declare war and raid safehouses.',
        default: false,
    },
    WarStartDelay: {
        type: 'number',
        group: 'PVP',
        description: 'Time in seconds before a declared war starts.',
        default: 600,
        min: 60,
    },
    WarDuration: {
        type: 'number',
        group: 'PVP',
        description: 'War duration in seconds.',
        default: 3600,
        min: 60,
    },
    WarSafehouseHitPoints: {
        type: 'number',
        group: 'PVP',
        description: 'Safehouse hit points limit during a war.',
        default: 3,
        min: 0,
    },

    // Safehouses
    PlayerSafehouse: {
        type: 'boolean',
        group: 'Safehouses',
        description: 'Both admins and players can claim safehouses.',
        default: false,
    },
    AdminSafehouse: {
        type: 'boolean',
        group: 'Safehouses',
        description: 'Only admins can claim safehouses.',
        default: false,
    },
    SafehouseAllowTrepass: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Allow non-members to enter a safehouse without being invited.',
        default: true,
    },
    SafehouseAllowFire: {
        type: 'boolean',
        group: 'Safehouses',
        description: 'Allow fire to damage safehouses.',
        default: true,
    },
    SafehouseAllowLoot: {
        type: 'boolean',
        group: 'Safehouses',
        description: 'Allow non-members to take items from safehouses.',
        default: true,
    },
    SafehouseAllowRespawn: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Players will respawn in a safehouse they were a member of before they died.',
        default: false,
    },
    SafehouseDaySurvivedToClaim: {
        type: 'number',
        group: 'Safehouses',
        description:
            'Players must have survived this number of in-game days before they can claim a safehouse.',
        default: 0,
        min: 0,
    },
    SafeHouseRemovalTime: {
        type: 'number',
        group: 'Safehouses',
        description:
            'Players are automatically removed from a safehouse they have not visited for this many real-world hours.',
        default: 144,
        min: 0,
    },
    SafehouseAllowNonResidential: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Governs whether players can claim non-residential buildings.',
        default: false,
    },
    SafehouseDisableDisguises: {
        type: 'boolean',
        group: 'Safehouses',
        description: 'Disable player disguises inside safehouses.',
        default: true,
    },
    SafehousePreventsLootRespawn: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Items will not respawn in buildings that players have claimed as a safehouse.',
        default: true,
    },
    DisableSafehouseWhenOwnerConnected: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Safehouse acts like a normal house if an owner is connected (only secure while the owner is offline).',
        default: false,
    },
    MaxSafezoneSize: {
        type: 'number',
        group: 'Safehouses',
        description: 'Maximum size of a safezone.',
        default: 20000,
        min: 0,
    },
    AllowDestructionBySledgehammer: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Allow players to destroy world objects with sledgehammers.',
        default: true,
    },
    SledgehammerOnlyInSafehouse: {
        type: 'boolean',
        group: 'Safehouses',
        description:
            'Allow players to destroy world objects only in their safehouse (requires AllowDestructionBySledgehammer).',
        default: false,
    },

    // Factions
    Faction: {
        type: 'boolean',
        group: 'Factions',
        description: 'Players can create factions.',
        default: true,
    },
    FactionDaySurvivedToCreate: {
        type: 'number',
        group: 'Factions',
        description:
            'Players must survive this number of in-game days before being allowed to create a faction.',
        default: 0,
        min: 0,
    },
    FactionPlayersRequiredForTag: {
        type: 'number',
        group: 'Factions',
        description:
            'Number of faction members required before the faction owner can create a group tag.',
        default: 1,
        min: 1,
    },

    // Chat & Voice
    GlobalChat: {
        type: 'boolean',
        group: 'Chat & Voice',
        description: 'Toggles global chat on or off.',
        default: true,
    },
    ChatStreams: {
        type: 'string',
        group: 'Chat & Voice',
        description:
            'Comma-separated list of enabled chat streams: s (say), r (radio), a (admin), w (whisper), y (yell), sh (shout), f (faction), all (general).',
        default: 's,r,a,w,y,sh,f,all',
    },
    ChatMessageCharacterLimit: {
        type: 'number',
        group: 'Chat & Voice',
        description: 'Maximum characters per chat message.',
        default: 200,
        min: 64,
        max: 1024,
    },
    ChatMessageSlowModeTime: {
        type: 'number',
        group: 'Chat & Voice',
        description: 'Minimum seconds between chat messages (slow mode).',
        default: 3,
        min: 1,
        max: 30,
    },
    AnnounceDeath: {
        type: 'boolean',
        group: 'Chat & Voice',
        description: 'Display a global chat message every time a player dies.',
        default: false,
    },
    AnnounceAnimalDeath: {
        type: 'boolean',
        group: 'Chat & Voice',
        description: 'Display a global chat message every time an animal dies.',
        default: false,
    },
    BanKickGlobalSound: {
        type: 'boolean',
        group: 'Chat & Voice',
        description: 'Play a global sound when a player is banned or kicked.',
        default: true,
    },
    VoiceEnable: {
        type: 'boolean',
        group: 'Chat & Voice',
        description: 'Enable VOIP (voice chat).',
        default: true,
    },
    VoiceMinDistance: {
        type: 'number',
        group: 'Chat & Voice',
        description:
            'The minimum tile distance over which VOIP sounds can be heard.',
        default: 10.0,
        min: 0,
        max: 100000,
    },
    VoiceMaxDistance: {
        type: 'number',
        group: 'Chat & Voice',
        description:
            'The maximum tile distance over which VOIP sounds can be heard.',
        default: 100.0,
        min: 0,
        max: 100000,
    },
    Voice3D: {
        type: 'boolean',
        group: 'Chat & Voice',
        description: 'Toggle directional audio for VOIP.',
        default: true,
    },
    BadWordListFile: {
        type: 'string',
        group: 'Chat & Voice',
        description:
            'Path to a file with a list of prohibited words, one per line.',
    },
    GoodWordListFile: {
        type: 'string',
        group: 'Chat & Voice',
        description:
            'Path to a file with words that should be allowed even if they contain a bad word, one per line.',
    },
    BadWordPolicy: {
        type: 'enum',
        group: 'Chat & Voice',
        description: 'What to do with the sender of a bad word in chat.',
        default: 3,
        options: [
            { value: '1', label: 'Ban' },
            { value: '2', label: 'Kick' },
            { value: '3', label: 'Record Violation' },
            { value: '4', label: 'Mute' },
        ],
    },
    BadWordReplacement: {
        type: 'string',
        group: 'Chat & Voice',
        description: 'The symbol or text that will replace a bad word.',
        default: '[HIDDEN]',
    },

    // Radio
    DisableRadioStaff: {
        type: 'boolean',
        group: 'Radio',
        description:
            'Disable radio transmissions from players with any access level.',
        default: false,
    },
    DisableRadioAdmin: {
        type: 'boolean',
        group: 'Radio',
        description:
            "Disable radio transmissions from players with 'admin' access level.",
        default: true,
    },
    DisableRadioGM: {
        type: 'boolean',
        group: 'Radio',
        description:
            "Disable radio transmissions from players with 'gm' access level.",
        default: true,
    },
    DisableRadioOverseer: {
        type: 'boolean',
        group: 'Radio',
        description:
            "Disable radio transmissions from players with 'overseer' access level.",
        default: false,
    },
    DisableRadioModerator: {
        type: 'boolean',
        group: 'Radio',
        description:
            "Disable radio transmissions from players with 'moderator' access level.",
        default: false,
    },
    DisableRadioInvisible: {
        type: 'boolean',
        group: 'Radio',
        description: 'Disable radio transmissions from invisible players.',
        default: true,
    },

    // Discord
    DiscordEnable: {
        type: 'boolean',
        group: 'Discord',
        description:
            'Enable global text chat integration with a Discord channel.',
        default: false,
    },
    DiscordToken: {
        type: 'string',
        group: 'Discord',
        description: 'Discord bot access token.',
        sensitive: true,
    },
    DiscordChatChannel: {
        type: 'string',
        group: 'Discord',
        description: 'The Discord chat channel name.',
    },
    DiscordLogChannel: {
        type: 'string',
        group: 'Discord',
        description: 'The Discord logs channel name.',
    },
    DiscordCommandChannel: {
        type: 'string',
        group: 'Discord',
        description: 'The Discord commands channel name.',
    },
    WebhookAddress: {
        type: 'string',
        group: 'Discord',
        description: 'The Slack incoming webhook URL.',
        sensitive: true,
    },

    // Gameplay
    NoFire: {
        type: 'boolean',
        group: 'Gameplay',
        description: 'All forms of fire are disabled — except for campfires.',
        default: false,
    },
    TrashDeleteAll: {
        type: 'boolean',
        group: 'Gameplay',
        description: 'Players can use the "delete all" button on bins.',
        default: false,
    },
    ItemNumbersLimitPerContainer: {
        type: 'number',
        group: 'Gameplay',
        description:
            'Maximum number of items in a container (0 = no limit). Note: counts individual small items such as nails.',
        default: 0,
        min: 0,
        max: 9000,
    },
    BloodSplatLifespanDays: {
        type: 'number',
        group: 'Gameplay',
        description:
            'Days before old blood splats are removed when map chunks load (0 = never).',
        default: 0,
        min: 0,
        max: 365,
    },
    RemovePlayerCorpsesOnCorpseRemoval: {
        type: 'boolean',
        group: 'Gameplay',
        description:
            "Also remove players' corpses from the ground when HoursForCorpseRemoval triggers.",
        default: false,
    },
    CarEngineAttractionModifier: {
        type: 'number',
        group: 'Gameplay',
        description:
            'Modify the range of zombie attraction to cars. Lower values can help with lag.',
        default: 0.5,
        min: 0,
        max: 10,
    },
    SpeedLimit: {
        type: 'number',
        group: 'Gameplay',
        description: 'Maximum vehicle speed.',
        default: 70.0,
        min: 10,
        max: 150,
    },
    DisableVehicleTowing: {
        type: 'boolean',
        group: 'Gameplay',
        description: 'Disable vehicle towing.',
        default: false,
    },
    DisableTrailerTowing: {
        type: 'boolean',
        group: 'Gameplay',
        description: 'Disable trailer towing.',
        default: false,
    },
    DisableBurntTowing: {
        type: 'boolean',
        group: 'Gameplay',
        description: 'Disable burnt vehicle towing.',
        default: false,
    },

    // Saves
    AutoSave: {
        type: 'boolean',
        group: 'Saves',
        description: 'Automatically save the world at regular intervals.',
        default: true,
    },
    SaveWorldEveryMinutes: {
        type: 'number',
        group: 'Saves',
        description:
            'Loaded parts of the map are saved after this many real-world minutes (0 = only when clients leave a loaded area).',
        default: 15,
        min: 0,
        max: 120,
    },
    ResetID: {
        type: 'number',
        group: 'Saves',
        description:
            'Determines if the server has undergone a soft reset — if this number does not match the client, the client must create a new character. Back this ID up somewhere.',
        default: 0,
        min: 0,
    },
    ServerPlayerID: {
        type: 'number',
        group: 'Saves',
        description:
            'Determines if a character is from another server or single player. May change on soft resets; used with ResetID. Back this ID up somewhere.',
        min: 0,
    },

    // Backups
    BackupsCount: {
        type: 'number',
        group: 'Backups',
        description: 'Maximum number of server backups to keep.',
        default: 5,
        min: 1,
        max: 300,
    },
    BackupsOnStart: {
        type: 'boolean',
        group: 'Backups',
        description: 'Create a backup when the server starts.',
        default: true,
    },
    BackupsOnVersionChange: {
        type: 'boolean',
        group: 'Backups',
        description: 'Create a backup when the game version changes.',
        default: true,
    },
    BackupsPeriod: {
        type: 'number',
        group: 'Backups',
        description:
            'Minutes between periodic automatic backups (0 = disabled).',
        default: 0,
        min: 0,
        max: 1500,
    },

    // Logging
    PerkLogs: {
        type: 'boolean',
        group: 'Logging',
        description:
            'Track changes in player perk levels in the PerkLog.txt server log.',
        default: true,
    },
    ClientCommandFilter: {
        type: 'string',
        group: 'Logging',
        description:
            'Semicolon-separated list of commands that will not be written to the cmd.txt server log. Prefix with - to exclude and + to include (e.g. -vehicle.*;+vehicle.installPart).',
    },
    ClientActionLogs: {
        type: 'string',
        group: 'Logging',
        description:
            'Semicolon-separated list of actions written to the ClientActionLogs.txt server log.',
    },

    // Security
    SteamVAC: {
        type: 'boolean',
        group: 'Security',
        description: 'Enable Valve Anti-Cheat (VAC) for the server.',
        default: true,
    },
    DoLuaChecksum: {
        type: 'boolean',
        group: 'Security',
        description: "Kick clients whose game files don't match the server's.",
        default: true,
    },
    AntiCheatSafety: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for the PVP safety system.',
    },
    AntiCheatMovement: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for player movement checks.',
    },
    AntiCheatHit: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for character hit checks.',
    },
    AntiCheatPacket: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for network packet checks.',
    },
    AntiCheatPermission: {
        type: 'number',
        group: 'Security',
        description:
            'Anti-cheat protection level for player permission checks.',
    },
    AntiCheatXP: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for player XP checks.',
    },
    AntiCheatSafeHouse: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for safehouse checks.',
    },
    AntiCheatPlayer: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for player checks.',
    },
    AntiCheatChecksum: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for checksum checks.',
    },
    AntiCheatItem: {
        type: 'number',
        group: 'Security',
        description: 'Anti-cheat protection level for item checks.',
    },

    // Mods (read-only — managed on mods page)
    Mods: {
        type: 'list',
        group: 'Mods',
        description: 'Active mod IDs. Managed on the Mods page.',
        readOnly: true,
    },
    WorkshopItems: {
        type: 'list',
        group: 'Mods',
        description:
            'Steam Workshop item IDs for active mods. Managed on the Mods page.',
        readOnly: true,
    },

    // Map
    Map: {
        type: 'string',
        group: 'Map',
        description:
            'Map name. PZ uses semicolons to separate multiple map entries.',
        default: 'Muldraugh, KY',
    },
    Seed: {
        type: 'string',
        group: 'Map',
        description:
            'The worldgen seed used to generate the world. To change it, set a new value and delete map_worldgen.bin in the save directory.',
    },
};

export const SERVER_INI_GROUP_ORDER = [
    'General',
    'Network',
    'Players',
    'PVP',
    'Safehouses',
    'Factions',
    'Chat & Voice',
    'Radio',
    'Discord',
    'Gameplay',
    'Saves',
    'Backups',
    'Logging',
    'Security',
    'Mods',
    'Map',
];

// ── SandboxVars.lua settings ────────────────────────────────────────

export const SANDBOX_META: Record<string, SettingMeta> = {
    // Zombie Lore
    'ZombieLore.Speed': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'Zombie movement speed.',
        default: 2,
        options: [
            { value: '1', label: 'Sprinters' },
            { value: '2', label: 'Fast Shamblers' },
            { value: '3', label: 'Shamblers' },
            { value: '4', label: 'Random' },
        ],
    },
    'ZombieLore.Strength': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How strong zombies are in combat.',
        default: 2,
        options: [
            { value: '1', label: 'Superhuman' },
            { value: '2', label: 'Normal' },
            { value: '3', label: 'Weak' },
        ],
    },
    'ZombieLore.Toughness': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How tough zombies are (damage to kill).',
        default: 2,
        options: [
            { value: '1', label: 'Tough' },
            { value: '2', label: 'Normal' },
            { value: '3', label: 'Fragile' },
        ],
    },
    'ZombieLore.Transmission': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How the zombie infection spreads.',
        default: 1,
        options: [
            { value: '1', label: 'Blood + Saliva' },
            { value: '2', label: 'Saliva Only' },
            { value: '3', label: "Everyone's Infected" },
            { value: '4', label: 'None' },
        ],
    },
    'ZombieLore.Mortality': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'Time from infection to death.',
        default: 5,
        options: [
            { value: '1', label: '0-30 seconds' },
            { value: '2', label: '0-1 minutes' },
            { value: '3', label: '0-12 hours' },
            { value: '4', label: '2-3 days' },
            { value: '5', label: '1-2 weeks' },
            { value: '6', label: 'Never' },
        ],
    },
    'ZombieLore.Reanimate': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'Time for dead bodies to reanimate.',
        default: 3,
        options: [
            { value: '1', label: '0-30 seconds' },
            { value: '2', label: '0-1 minutes' },
            { value: '3', label: '0-12 hours' },
            { value: '4', label: '2-3 days' },
            { value: '5', label: '1-2 weeks' },
        ],
    },
    'ZombieLore.Cognition': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'Zombie navigation intelligence.',
        default: 2,
        options: [
            { value: '1', label: 'Navigate + Use Doors' },
            { value: '2', label: 'Navigate' },
            { value: '3', label: 'Basic Navigation' },
        ],
    },
    'ZombieLore.Memory': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How long zombies remember seeing a player.',
        default: 2,
        options: [
            { value: '1', label: 'Long' },
            { value: '2', label: 'Normal' },
            { value: '3', label: 'Short' },
            { value: '4', label: 'None' },
        ],
    },
    'ZombieLore.Decomp': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'Zombie decomposition over time — weakens them gradually.',
        default: 1,
        options: [
            { value: '1', label: 'Slows + Weakens' },
            { value: '2', label: 'Slows' },
            { value: '3', label: 'Weakens' },
            { value: '4', label: 'None' },
        ],
    },
    'ZombieLore.Sight': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How far zombies can see players.',
        default: 2,
        options: [
            { value: '1', label: 'Eagle' },
            { value: '2', label: 'Normal' },
            { value: '3', label: 'Poor' },
        ],
    },
    'ZombieLore.Hearing': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How well zombies hear sounds.',
        default: 2,
        options: [
            { value: '1', label: 'Pinpoint' },
            { value: '2', label: 'Normal' },
            { value: '3', label: 'Poor' },
        ],
    },
    'ZombieLore.Smell': {
        type: 'enum',
        group: 'Zombie Lore',
        description: 'How well zombies smell blood.',
        default: 2,
        options: [
            { value: '1', label: 'Bloodhound' },
            { value: '2', label: 'Normal' },
            { value: '3', label: 'Poor' },
        ],
    },

    // Zombie Population
    'ZombieConfig.PopulationMultiplier': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Overall zombie population multiplier.',
        default: 1.0,
        min: 0,
        max: 4,
    },
    'ZombieConfig.PopulationStartMultiplier': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Zombie population at day 1 (multiplier).',
        default: 1.0,
        min: 0,
        max: 4,
    },
    'ZombieConfig.PopulationPeakMultiplier': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Zombie population at peak day (multiplier).',
        default: 1.5,
        min: 0,
        max: 4,
    },
    'ZombieConfig.PopulationPeakDay': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Day when zombie population reaches peak.',
        default: 28,
        min: 1,
        max: 365,
    },
    'ZombieConfig.RespawnHours': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Hours before zombies can respawn in cleared areas.',
        default: 72,
        min: 0,
        max: 8760,
    },
    'ZombieConfig.RespawnUnseenHours': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Hours a cell must be unseen before zombies respawn.',
        default: 16,
        min: 0,
        max: 8760,
    },
    'ZombieConfig.RespawnMultiplier': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Fraction of original zombies that respawn.',
        default: 0.1,
        min: 0,
        max: 1,
    },
    'ZombieConfig.RedistributeHours': {
        type: 'number',
        group: 'Zombie Population',
        description: 'Hours between zombie redistribution across the map.',
        default: 12,
        min: 0,
        max: 8760,
    },

    // Time & Start
    DayLength: {
        type: 'enum',
        group: 'Time & Start',
        description: 'Length of an in-game day in real-time.',
        default: 2,
        options: [
            { value: '1', label: '15 minutes' },
            { value: '2', label: '30 minutes' },
            { value: '3', label: '1 hour' },
            { value: '4', label: '2 hours' },
            { value: '5', label: '3 hours' },
            { value: '6', label: '4 hours' },
            { value: '7', label: '5 hours' },
            { value: '8', label: '6 hours' },
            { value: '9', label: '7 hours' },
            { value: '10', label: '8 hours' },
            { value: '11', label: '9 hours' },
            { value: '12', label: '10 hours' },
            { value: '13', label: '11 hours' },
            { value: '14', label: '12 hours' },
        ],
    },
    StartYear: {
        type: 'number',
        group: 'Time & Start',
        description: 'Starting year of the game world.',
        default: 1993,
        min: 1,
    },
    StartMonth: {
        type: 'number',
        group: 'Time & Start',
        description: 'Starting month (1 = January, 12 = December).',
        default: 7,
        min: 1,
        max: 12,
    },
    StartDay: {
        type: 'number',
        group: 'Time & Start',
        description: 'Starting day of the month.',
        default: 9,
        min: 1,
        max: 31,
    },

    // World
    Temperature: {
        type: 'enum',
        group: 'World',
        description: 'World temperature modifier.',
        default: 3,
        options: [
            { value: '1', label: 'Very Cold' },
            { value: '2', label: 'Cold' },
            { value: '3', label: 'Normal' },
            { value: '4', label: 'Hot' },
            { value: '5', label: 'Very Hot' },
        ],
    },
    Rain: {
        type: 'enum',
        group: 'World',
        description: 'Amount of rain.',
        default: 3,
        options: [
            { value: '1', label: 'Very Dry' },
            { value: '2', label: 'Dry' },
            { value: '3', label: 'Normal' },
            { value: '4', label: 'Rainy' },
            { value: '5', label: 'Very Rainy' },
        ],
    },
    ErosionSpeed: {
        type: 'enum',
        group: 'World',
        description: 'Speed of nature reclaiming the world.',
        default: 3,
        options: [
            { value: '1', label: 'Very Fast (20 days)' },
            { value: '2', label: 'Fast (50 days)' },
            { value: '3', label: 'Normal (100 days)' },
            { value: '4', label: 'Slow (200 days)' },
            { value: '5', label: 'Very Slow (500 days)' },
        ],
    },
    WaterShut: {
        type: 'number',
        group: 'World',
        description: 'Day when water shuts off (0 = instant, -1 = never).',
        default: 14,
        min: -1,
        max: 365,
    },
    ElecShut: {
        type: 'number',
        group: 'World',
        description:
            'Day when electricity shuts off (0 = instant, -1 = never).',
        default: 14,
        min: -1,
        max: 365,
    },

    // Loot & Resources
    LootRespawn: {
        type: 'enum',
        group: 'Loot & Resources',
        description: 'Frequency of loot respawning.',
        default: 1,
        options: [
            { value: '1', label: 'None' },
            { value: '2', label: 'Every Day' },
            { value: '3', label: 'Every Week' },
            { value: '4', label: 'Every Month' },
            { value: '5', label: 'Every 2 Months' },
        ],
    },
    NatureAbundance: {
        type: 'enum',
        group: 'Loot & Resources',
        description: 'Abundance of foraging, fishing, and trapping.',
        default: 3,
        options: [
            { value: '1', label: 'Very Poor' },
            { value: '2', label: 'Poor' },
            { value: '3', label: 'Normal' },
            { value: '4', label: 'Abundant' },
            { value: '5', label: 'Very Abundant' },
        ],
    },
    Farming: {
        type: 'enum',
        group: 'Loot & Resources',
        description: 'Speed of farming growth.',
        default: 2,
        options: [
            { value: '1', label: 'Very Fast' },
            { value: '2', label: 'Fast' },
            { value: '3', label: 'Normal' },
            { value: '4', label: 'Slow' },
            { value: '5', label: 'Very Slow' },
        ],
    },
    Alarm: {
        type: 'enum',
        group: 'Loot & Resources',
        description: 'Frequency of house alarms triggering.',
        default: 6,
        options: [
            { value: '1', label: 'Never' },
            { value: '2', label: 'Extremely Rare' },
            { value: '3', label: 'Rare' },
            { value: '4', label: 'Sometimes' },
            { value: '5', label: 'Often' },
            { value: '6', label: 'Very Often' },
        ],
    },
    LockedHouses: {
        type: 'enum',
        group: 'Loot & Resources',
        description: 'Frequency of houses being locked.',
        default: 6,
        options: [
            { value: '1', label: 'Never' },
            { value: '2', label: 'Extremely Rare' },
            { value: '3', label: 'Rare' },
            { value: '4', label: 'Sometimes' },
            { value: '5', label: 'Often' },
            { value: '6', label: 'Very Often' },
        ],
    },

    // Gameplay
    Zombies: {
        type: 'enum',
        group: 'Gameplay',
        description: 'Overall zombie count preset.',
        default: 4,
        options: [
            { value: '0', label: 'None' },
            { value: '1', label: 'Insane' },
            { value: '2', label: 'Very High' },
            { value: '3', label: 'High' },
            { value: '4', label: 'Normal' },
            { value: '5', label: 'Low' },
        ],
    },
    Distribution: {
        type: 'enum',
        group: 'Gameplay',
        description: 'How zombies are distributed across the map.',
        default: 1,
        options: [
            { value: '1', label: 'Urban Focused' },
            { value: '2', label: 'Uniform' },
        ],
    },
    XpMultiplier: {
        type: 'number',
        group: 'Gameplay',
        description: 'Experience point gain multiplier.',
        default: 1.0,
        min: 0.01,
        max: 1000,
    },
};

export const SANDBOX_GROUP_ORDER = [
    'Zombie Lore',
    'Zombie Population',
    'Time & Start',
    'World',
    'Loot & Resources',
    'Gameplay',
];

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Group settings by their metadata group.
 * Unknown keys (not in metadata) are placed in an "Other" group.
 */
export function groupSettings(
    settings: Record<string, string>,
    meta: Record<string, SettingMeta>,
    groupOrder: string[],
): {
    group: string;
    entries: { key: string; value: string; meta?: SettingMeta }[];
}[] {
    const groups = new Map<
        string,
        { key: string; value: string; meta?: SettingMeta }[]
    >();

    // Initialize ordered groups
    for (const g of groupOrder) {
        groups.set(g, []);
    }

    for (const [key, value] of Object.entries(settings)) {
        const m = meta[key];
        const group = m?.group ?? 'Other';
        if (!groups.has(group)) {
            groups.set(group, []);
        }
        groups.get(group)!.push({ key, value, meta: m });
    }

    // Return in order, filtering empty groups
    const result: {
        group: string;
        entries: { key: string; value: string; meta?: SettingMeta }[];
    }[] = [];
    for (const g of groupOrder) {
        const entries = groups.get(g);
        if (entries && entries.length > 0) {
            result.push({ group: g, entries });
        }
    }

    // Append "Other" at the end if it has entries
    const other = groups.get('Other');
    if (other && other.length > 0) {
        result.push({ group: 'Other', entries: other });
    }

    return result;
}
