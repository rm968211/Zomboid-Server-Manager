--
-- ZM_PlayerTracker.lua — Writes online player positions to players_live.json
--

local JSON = require("ZM_JSON")
require("ZM_Utils")

ZM_PlayerTracker = {}

local POSITIONS_FILE = "players_live.json"

--- Export positions of all online players
function ZM_PlayerTracker.exportPositions()
    local onlinePlayers = getOnlinePlayers()
    if not onlinePlayers then
        return false
    end

    local players = {}
    for i = 0, onlinePlayers:size() - 1 do
        local player = onlinePlayers:get(i)
        if player then
            local entry = {
                username = player:getUsername() or "unknown",
                x = math.floor((player:getX() or 0) * 10) / 10,
                y = math.floor((player:getY() or 0) * 10) / 10,
                z = math.floor(player:getZ() or 0),
                is_dead = player:isDead() or false,
                is_ghost = player:isGhostMode() and player:isGhostMode() or false,
            }
            table.insert(players, entry)
        end
    end

    -- Wall-clock, NOT getGameTime(): PHP compares this against the real clock to
    -- decide whether positions are still fresh, and PZ's in-game calendar starts
    -- in 1993, which reads as decades stale.
    local data = {
        timestamp = ZM_Utils.getTimestamp(),
        players = players,
    }

    local ok, jsonStr = pcall(JSON.encode, data)
    if not ok then
        print("[ZomboidManager] ERROR encoding player positions: " .. tostring(jsonStr))
        return false
    end

    local writer = getFileWriter(POSITIONS_FILE, true, false)
    if not writer then
        print("[ZomboidManager] ERROR: cannot write player positions")
        return false
    end

    writer:write(jsonStr)
    writer:close()

    return true
end

return ZM_PlayerTracker
