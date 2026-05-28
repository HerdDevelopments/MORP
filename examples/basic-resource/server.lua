-- basic-greeter — server.lua
-- MORP Protocol 0.1 example resource

-- ── Player connect ────────────────────────────────────────────────
MORP.on('playerConnect', function(playerName, setKickReason, deferrals)
  local src = source
  deferrals.defer()

  MORP.after(100, function()
    local name = MORP.player.getName(src)
    local ids  = MORP.player.getIdentifiers(src)

    MORP.log.info(('Connecting: %s [%s]'):format(name, ids.license or 'no-license'))

    MORP.state.player(src).set('displayName', name)
    MORP.state.player(src).set('joinedAt',    os.time())

    deferrals.done()
  end)
end)

-- ── Player disconnect ─────────────────────────────────────────────
MORP.on('playerDisconnect', function(reason)
  local src     = source
  local name    = MORP.player.getName(src)
  local joined  = MORP.state.player(src).get('joinedAt')
  local session = joined and (os.time() - joined) or 0

  MORP.log.info(('%s left. Session: %ds'):format(name, session))
  MORP.emitAllClients('greeter:playerLeft', name, session)
end)

-- ── Callback: getServerInfo ───────────────────────────────────────
MORP.callback.register('greeter:serverInfo', function(src, cb)
  cb({
    players  = #MORP.player.getAll(),
    uptime   = os.time(),
    protocol = '0.1',
  })
end)

-- ── Export: getDisplayName ────────────────────────────────────────
MORP.export('getDisplayName', function(src)
  return MORP.state.player(src).get('displayName')
    or MORP.player.getName(src)
end)

-- ── Periodic announce ─────────────────────────────────────────────
MORP.every(300000, function() -- every 5 min
  local count = #MORP.player.getAll()
  MORP.emitAllClients('greeter:playerCount', count)
  MORP.log.info(('Online: %d players'):format(count))
end)
