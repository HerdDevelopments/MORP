--[[
  MORP Entity API — FiveM Lua Adapter Module
  Protocol: 0.2.0
  Spec: Section 12

  Loaded automatically by morp_adapter.lua
  Do not require directly.
]]

MORP.entity = {}

local function isServer() return IsDuplicityVersion() end

-- ─────────────────────────────────────────
-- CORE
-- ─────────────────────────────────────────

function MORP.entity.create(modelHash, coords, heading)
  if isServer() then
    MORP.log.warn('entity.create is client-side only')
    return nil
  end
  MORP.entity.loadModel(modelHash, function() end)
  -- Synchronous fallback: caller should use loadModel callback pattern
  local ent = CreateObject(modelHash, coords.x, coords.y, coords.z, true, true, false)
  SetEntityHeading(ent, heading or 0.0)
  return ent
end

function MORP.entity.delete(entity)
  if DoesEntityExist(entity) then
    SetEntityAsMissionEntity(entity, false, true)
    DeleteEntity(entity)
  end
end

function MORP.entity.isValid(entity)
  return entity ~= nil and entity ~= 0
end

function MORP.entity.exists(entity)
  return DoesEntityExist(entity)
end

-- ─────────────────────────────────────────
-- TRANSFORM
-- ─────────────────────────────────────────

function MORP.entity.getCoords(entity)
  return GetEntityCoords(entity)
end

function MORP.entity.setCoords(entity, x, y, z)
  SetEntityCoords(entity, x, y, z, false, false, false, false)
end

function MORP.entity.getHeading(entity)
  return GetEntityHeading(entity)
end

function MORP.entity.setHeading(entity, heading)
  SetEntityHeading(entity, heading)
end

function MORP.entity.getVelocity(entity)
  return GetEntityVelocity(entity)
end

function MORP.entity.setVelocity(entity, x, y, z)
  SetEntityVelocity(entity, x, y, z)
end

function MORP.entity.getRotation(entity)
  return GetEntityRotation(entity, 2)
end

function MORP.entity.setRotation(entity, p, r, y)
  SetEntityRotation(entity, p, r, y, 2, true)
end

-- ─────────────────────────────────────────
-- PROPERTIES
-- ─────────────────────────────────────────

function MORP.entity.getModel(entity)
  return GetEntityModel(entity)
end

function MORP.entity.getType(entity)
  local t = GetEntityType(entity)
  if t == 1 then return 'ped'
  elseif t == 2 then return 'vehicle'
  elseif t == 3 then return 'object'
  else return 'unknown' end
end

function MORP.entity.isVisible(entity)
  return IsEntityVisible(entity)
end

function MORP.entity.setVisible(entity, visible)
  SetEntityVisible(entity, visible, false)
end

function MORP.entity.isInvincible(entity)
  return GetEntityInvincible(entity)
end

function MORP.entity.setInvincible(entity, invincible)
  SetEntityInvincible(entity, invincible)
end

function MORP.entity.getHealth(entity)
  return GetEntityHealth(entity)
end

function MORP.entity.setHealth(entity, health)
  SetEntityHealth(entity, health)
end

function MORP.entity.getMaxHealth(entity)
  return GetEntityMaxHealth(entity)
end

function MORP.entity.setMaxHealth(entity, max)
  SetEntityMaxHealth(entity, max)
end

function MORP.entity.isDead(entity)
  return IsEntityDead(entity)
end

function MORP.entity.isAlive(entity)
  return not IsEntityDead(entity)
end

function MORP.entity.freeze(entity, frozen)
  FreezeEntityPosition(entity, frozen)
end

function MORP.entity.setNoCollision(entity, noCollision)
  SetEntityCollision(entity, not noCollision, true)
end

-- ─────────────────────────────────────────
-- ATTACHMENT
-- ─────────────────────────────────────────

function MORP.entity.attach(entity, target, boneIndex, ox, oy, oz, rx, ry, rz)
  AttachEntityToEntity(
    entity, target,
    boneIndex or 0,
    ox or 0.0, oy or 0.0, oz or 0.0,
    rx or 0.0, ry or 0.0, rz or 0.0,
    false, false, false, false, 2, true
  )
end

function MORP.entity.detach(entity)
  DetachEntity(entity, true, true)
end

function MORP.entity.isAttached(entity)
  return IsEntityAttached(entity)
end

function MORP.entity.getAttachedTo(entity)
  if not IsEntityAttached(entity) then return nil end
  return GetEntityAttachedTo(entity)
end

-- ─────────────────────────────────────────
-- NETWORK / OWNERSHIP (server-side)
-- ─────────────────────────────────────────

function MORP.entity.getNetId(entity)
  return NetworkGetNetworkIdFromEntity(entity)
end

function MORP.entity.fromNetId(netId)
  return NetworkGetEntityFromNetworkId(netId)
end

function MORP.entity.getOwner(entity)
  if not isServer() then
    MORP.log.warn('entity.getOwner is server-side only')
    return nil
  end
  return NetworkGetEntityOwner(entity)
end

function MORP.entity.setAsMission(entity, mission)
  SetEntityAsMissionEntity(entity, mission, true)
end

-- ─────────────────────────────────────────
-- MODEL LOADING (client-side)
-- ─────────────────────────────────────────

function MORP.entity.loadModel(modelHash, callback)
  if isServer() then
    MORP.log.warn('entity.loadModel is client-side only')
    return
  end

  if not IsModelValid(modelHash) then
    MORP.log.error(('entity.loadModel: invalid model hash %s'):format(tostring(modelHash)))
    return
  end

  if HasModelLoaded(modelHash) then
    callback()
    return
  end

  RequestModel(modelHash)
  Citizen.CreateThread(function()
    local timeout = 5000
    local elapsed = 0
    while not HasModelLoaded(modelHash) do
      Citizen.Wait(50)
      elapsed = elapsed + 50
      if elapsed >= timeout then
        MORP.log.error(('entity.loadModel: timed out loading %s'):format(tostring(modelHash)))
        return
      end
    end
    callback()
  end)
end

function MORP.entity.isModelLoaded(modelHash)
  return HasModelLoaded(modelHash)
end

function MORP.entity.releaseModel(modelHash)
  SetModelAsNoLongerNeeded(modelHash)
end

MORP.log.debug('Entity API module loaded')
