--[[
  MORP Adapter — FiveM (Lua)
  Protocol:  0.2.0
  Platform:  FiveM / cfx-server / citizen runtime
  Full Name: Modding Open Resource Protocol

  Usage: Add as shared_script in fxmanifest.lua
    shared_script '@morp-core/adapter/lua/morp_adapter.lua'

  Modules loaded:
    core    — lifecycle, events, player, state, exports, callbacks, scheduler
    entity  — Section 12
    vehicle — Section 13
    ped     — Section 14
]]

MORP = MORP or {}

local _timers    = {}
local _timerIdx  = 0
local _callbacks = {}

-- ─────────────────────────────────────────
-- INTERNAL UTILS
-- ─────────────────────────────────────────

local function isServer()
  return IsDuplicityVersion()
end

local function newTimerId()
  _timerIdx = _timerIdx + 1
  return _timerIdx
end

-- ─────────────────────────────────────────
-- LIFECYCLE + EVENTS
-- ─────────────────────────────────────────

local _lifecycleMap = {
  start            = GetCurrentResourceName() and ('ON_RESOURCE_START_' .. GetCurrentResourceName()) or 'onResourceStart',
  stop             = GetCurrentResourceName() and ('ON_RESOURCE_STOP_'  .. GetCurrentResourceName()) or 'onResourceStop',
  playerConnect    = 'playerConnecting',
  playerDisconnect = 'playerDropped',
  clientReady      = 'onClientResourceStart',
}

local _handlers = {}

function MORP.on(event, handler)
  local mapped = _lifecycleMap[event]
  if mapped then
    AddEventHandler(mapped, handler)
    return
  end
  AddEventHandler('morp:' .. event, handler)
  if not _handlers[event] then _handlers[event] = {} end
  table.insert(_handlers[event], handler)
end

function MORP.off(event, handler)
  if not _handlers[event] then return end
  for i, h in ipairs(_handlers[event]) do
    if h == handler then
      table.remove(_handlers[event], i)
      break
    end
  end
end

function MORP.emit(event, ...)
  TriggerEvent('morp:' .. event, ...)
end

function MORP.emitServer(event, ...)
  if isServer() then
    TriggerEvent('morp:' .. event, ...)
  else
    TriggerServerEvent('morp:' .. event, ...)
  end
end

function MORP.emitClient(player, event, ...)
  if not isServer() then
    MORP.log.warn('emitClient called from client — ignored')
    return
  end
  TriggerClientEvent('morp:' .. event, player, ...)
end

function MORP.emitAllClients(event, ...)
  if isServer() then
    TriggerClientEvent('morp:' .. event, -1, ...)
  end
end

function MORP.emitAllClientsExcept(player, event, ...)
  if not isServer() then return end
  for _, src in ipairs(GetPlayers()) do
    if tonumber(src) ~= tonumber(player) then
      TriggerClientEvent('morp:' .. event, tonumber(src), ...)
    end
  end
end

-- ─────────────────────────────────────────
-- PLAYER API
-- ─────────────────────────────────────────

MORP.player = {}

if isServer() then

  function MORP.player.getName(src)
    return GetPlayerName(src) or 'Unknown'
  end

  function MORP.player.getId(src)
    return tonumber(src)
  end

  function MORP.player.getPing(src)
    return GetPlayerPing(src)
  end

  function MORP.player.kick(src, reason)
    DropPlayer(src, reason or 'Kicked')
  end

  function MORP.player.getAll()
    local out = {}
    for _, src in ipairs(GetPlayers()) do
      table.insert(out, tonumber(src))
    end
    return out
  end

  function MORP.player.getIdentifiers(src)
    local ids = {}
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
      local id = GetPlayerIdentifier(src, i)
      if id then
        local prefix = id:match('^(.-)%:')
        if prefix then ids[prefix] = id end
      end
    end
    return ids
  end

  function MORP.player.getBucket(src)
    return GetPlayerRoutingBucket(src)
  end

  function MORP.player.setBucket(src, bucket)
    SetPlayerRoutingBucket(src, bucket)
  end

else

  -- Client-side

  function MORP.player.local_()
    return PlayerId()
  end

  function MORP.player.getPed()
    return PlayerPedId()
  end

  function MORP.player.getCoords()
    return GetEntityCoords(PlayerPedId())
  end

  function MORP.player.getHeading()
    return GetEntityHeading(PlayerPedId())
  end

end

-- ─────────────────────────────────────────
-- STATE / KV
-- ─────────────────────────────────────────

MORP.state = {}

function MORP.state.set(key, value)
  if not isServer() then
    MORP.log.warn('state.set is server-only for global state')
    return
  end
  GlobalState[key] = value
end

function MORP.state.get(key)
  return GlobalState[key]
end

function MORP.state.delete(key)
  if isServer() then GlobalState[key] = nil end
end

function MORP.state.player(src)
  return {
    set    = function(key, value) Player(src).state[key] = value end,
    get    = function(key)        return Player(src).state[key]  end,
    delete = function(key)        Player(src).state[key] = nil   end,
  }
end

function MORP.state.entity(ent)
  return {
    set    = function(key, value) Entity(ent).state[key] = value end,
    get    = function(key)        return Entity(ent).state[key]  end,
    delete = function(key)        Entity(ent).state[key] = nil   end,
  }
end

-- ─────────────────────────────────────────
-- EXPORTS / IMPORTS
-- ─────────────────────────────────────────

function MORP.export(name, fn)
  exports(name, fn)
end

function MORP.import(resource, name)
  return function(...)
    return exports[resource][name](...)
  end
end

-- ─────────────────────────────────────────
-- CALLBACKS
-- ─────────────────────────────────────────

MORP.callback = {}

if isServer() then

  function MORP.callback.register(name, handler)
    AddEventHandler('morp:cb:req:' .. name, function(cbId, ...)
      local src = source
      handler(src, function(...)
        TriggerClientEvent('morp:cb:res:' .. name, src, cbId, ...)
      end, ...)
    end)
  end

else

  local _pendingCbs = {}

  function MORP.callback.trigger(name, cb, ...)
    local cbId = tostring(math.random(100000, 999999)) .. tostring(GetGameTimer())
    _pendingCbs[cbId] = cb

    AddEventHandler('morp:cb:res:' .. name, function(resId, ...)
      if resId == cbId and _pendingCbs[resId] then
        _pendingCbs[resId](...)
        _pendingCbs[resId] = nil
      end
    end)

    TriggerServerEvent('morp:cb:req:' .. name, cbId, ...)
  end

end

-- ─────────────────────────────────────────
-- SCHEDULER
-- ─────────────────────────────────────────

function MORP.every(ms, fn)
  local id = newTimerId()
  local function loop()
    Citizen.SetTimeout(ms, function()
      if _timers[id] then
        fn()
        loop()
      end
    end)
  end
  _timers[id] = true
  loop()
  return id
end

function MORP.after(ms, fn)
  local id = newTimerId()
  _timers[id] = true
  Citizen.SetTimeout(ms, function()
    if _timers[id] then
      fn()
      _timers[id] = nil
    end
  end)
  return id
end

function MORP.nextTick(fn)
  Citizen.CreateThread(function()
    Citizen.Wait(0)
    fn()
  end)
end

function MORP.cancel(id)
  _timers[id] = nil
end

-- ─────────────────────────────────────────
-- LOGGING
-- ─────────────────────────────────────────

MORP.log = {}
local _debug = GetConvar('MORP_DEBUG', 'false') == 'true'

function MORP.log.info(msg)
  print('^2[MORP]^7 ' .. tostring(msg))
end

function MORP.log.warn(msg)
  print('^3[MORP WARN]^7 ' .. tostring(msg))
end

function MORP.log.error(msg)
  print('^1[MORP ERROR]^7 ' .. tostring(msg))
end

function MORP.log.debug(msg)
  if _debug then
    print('^5[MORP DEBUG]^7 ' .. tostring(msg))
  end
end

-- ─────────────────────────────────────────
-- LOAD MODULES
-- ─────────────────────────────────────────

local _resName = GetCurrentResourceName()

local function loadModule(name)
  local path = ('adapter/lua/modules/%s.lua'):format(name)
  local content = LoadResourceFile(_resName, path)
  if content then
    local fn, err = load(content)
    if fn then
      fn()
    else
      MORP.log.error(('Failed to load module %s: %s'):format(name, tostring(err)))
    end
  else
    MORP.log.warn(('Module not found: %s (path: %s)'):format(name, path))
  end
end

loadModule('entity')
loadModule('vehicle')
loadModule('ped')
loadModule('signing')

-- ─────────────────────────────────────────
-- READY
-- ─────────────────────────────────────────

MORP.log.info(('Adapter loaded — FiveM/Lua — Protocol 0.2.0 — Resource: %s'):format(
  _resName or 'unknown'
))
