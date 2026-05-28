-- world-demo — server.lua
-- Server-side companion for world-demo example

-- Track spawned vehicles by player
local playerVehicles = {}

MORP.on('playerDisconnect', function()
  local src = source
  playerVehicles[src] = nil
end)

-- Client notifies server of spawned vehicle net ID
MORP.on('worldDemo:vehicleSpawned', function(netId)
  local src = source
  playerVehicles[src] = netId

  MORP.log.info(('Player %s [%s] spawned vehicle netId: %d'):format(
    MORP.player.getName(src),
    MORP.player.getId(src),
    netId
  ))

  -- Store on player state (replicated to client)
  MORP.state.player(src).set('lastVehicleNetId', netId)
end)

-- Export: get a player's last spawned vehicle netId
MORP.export('getPlayerVehicleNetId', function(src)
  return playerVehicles[src]
end)
