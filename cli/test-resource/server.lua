-- test-resource — server.lua
-- MORP Protocol 0.2

MORP.on('playerConnect', function()
  MORP.log.info('Player connected: ' .. MORP.player.getName(source))
end)

