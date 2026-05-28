-- basic-greeter — client.lua
-- MORP Protocol 0.1 example resource

-- ── Client ready ──────────────────────────────────────────────────
MORP.on('clientReady', function()
  MORP.log.info('basic-greeter client ready')

  -- Trigger callback to server
  MORP.callback.trigger('greeter:serverInfo', function(info)
    MORP.log.info(('Server — players: %d | protocol: %s'):format(
      info.players, info.protocol
    ))
  end)
end)

-- ── Player left broadcast ─────────────────────────────────────────
MORP.on('greeter:playerLeft', function(name, session)
  MORP.log.info(('%s disconnected after %ds'):format(name, session))
end)

-- ── Player count update ───────────────────────────────────────────
MORP.on('greeter:playerCount', function(count)
  MORP.log.debug(('Active players: %d'):format(count))
end)
