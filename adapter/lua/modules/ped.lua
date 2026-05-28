--[[
  MORP Ped API — FiveM Lua Adapter Module
  Protocol: 0.2.0
  Spec: Section 14
]]

MORP.ped  = {}
MORP.ped.task = {}

local function isServer() return IsDuplicityVersion() end

-- ─────────────────────────────────────────
-- SPAWNING
-- ─────────────────────────────────────────

function MORP.ped.spawn(modelHash, coords, heading, options)
  if isServer() then
    MORP.log.warn('ped.spawn is client-side only')
    return nil
  end

  options = options or {}

  MORP.entity.loadModel(modelHash, function() end)

  local ped = CreatePed(
    4,
    modelHash,
    coords.x, coords.y, coords.z,
    heading or 0.0,
    options.networked ~= false,
    false
  )

  if not DoesEntityExist(ped) then
    MORP.log.error('ped.spawn: failed to create ped')
    return nil
  end

  if options.freeze     then FreezeEntityPosition(ped, true) end
  if options.invincible then SetEntityInvincible(ped, true)  end

  if options.scenario then
    TaskStartScenarioInPlace(ped, options.scenario, 0, true)
  end

  SetModelAsNoLongerNeeded(modelHash)
  SetEntityAsMissionEntity(ped, true, true)

  return ped
end

function MORP.ped.delete(ped)
  MORP.entity.delete(ped)
end

-- ─────────────────────────────────────────
-- IDENTITY & STATE
-- ─────────────────────────────────────────

function MORP.ped.getType(ped)
  return IsPedAPlayer(ped) and 'player' or 'npc'
end

function MORP.ped.getModel(ped)
  return GetEntityModel(ped)
end

function MORP.ped.isInVehicle(ped)
  return IsPedInAnyVehicle(ped, false)
end

function MORP.ped.getVehicle(ped)
  if not IsPedInAnyVehicle(ped, false) then return nil end
  return GetVehiclePedIsIn(ped, false)
end

function MORP.ped.getCurrentSeat(ped)
  local veh = GetVehiclePedIsIn(ped, false)
  if not DoesEntityExist(veh) then return nil end
  for seat = -1, GetVehicleMaxNumberOfPassengers(veh) - 1 do
    if GetPedInVehicleSeat(veh, seat) == ped then return seat end
  end
  return nil
end

function MORP.ped.isOnFoot(ped)
  return not IsPedInAnyVehicle(ped, false)
end

function MORP.ped.isDead(ped)
  return IsEntityDead(ped)
end

function MORP.ped.isInjured(ped)
  return IsPedInjured(ped)
end

function MORP.ped.isInCombat(ped)
  return IsPedInCombat(ped, PlayerPedId())
end

function MORP.ped.isAiming(ped)
  return IsPedAimingFromCover(ped) or GetPedLastWeapon(ped) ~= 0xA2719263
end

function MORP.ped.isReloading(ped)
  return IsPedReloading(ped)
end

function MORP.ped.isFalling(ped)
  return IsPedFalling(ped)
end

function MORP.ped.isSwimming(ped)
  return IsPedSwimming(ped)
end

function MORP.ped.isRagdoll(ped)
  return IsPedRagdoll(ped)
end

-- ─────────────────────────────────────────
-- HEALTH & ARMOUR
-- ─────────────────────────────────────────

function MORP.ped.getHealth(ped)
  return GetEntityHealth(ped)
end

function MORP.ped.setHealth(ped, health)
  SetEntityHealth(ped, health)
end

function MORP.ped.getMaxHealth(ped)
  return GetEntityMaxHealth(ped)
end

function MORP.ped.setMaxHealth(ped, max)
  SetEntityMaxHealth(ped, max)
end

function MORP.ped.getArmour(ped)
  return GetPedArmour(ped)
end

function MORP.ped.setArmour(ped, armour)
  SetPedArmour(ped, math.min(100, math.max(0, armour)))
end

function MORP.ped.addArmour(ped, amount)
  local cur = GetPedArmour(ped)
  SetPedArmour(ped, math.min(100, cur + amount))
end

-- ─────────────────────────────────────────
-- WEAPONS
-- ─────────────────────────────────────────

function MORP.ped.giveWeapon(ped, weaponHash, ammo, equip)
  GiveWeaponToPed(ped, weaponHash, ammo or 0, false, equip or false)
end

function MORP.ped.removeWeapon(ped, weaponHash)
  RemoveWeaponFromPed(ped, weaponHash)
end

function MORP.ped.removeAllWeapons(ped)
  RemoveAllPedWeapons(ped, true)
end

function MORP.ped.hasWeapon(ped, weaponHash)
  local has, _ = GetPedWeaponTintIndex(ped, weaponHash)
  return HasPedGotWeapon(ped, weaponHash, false)
end

function MORP.ped.getCurrentWeapon(ped)
  local _, weapon = GetCurrentPedWeapon(ped, true)
  return weapon
end

function MORP.ped.setCurrentWeapon(ped, weaponHash)
  SetCurrentPedWeapon(ped, weaponHash, true)
end

function MORP.ped.getAmmo(ped, weaponHash)
  return GetAmmoInPedWeapon(ped, weaponHash)
end

function MORP.ped.setAmmo(ped, weaponHash, ammo)
  SetPedAmmo(ped, weaponHash, ammo)
end

function MORP.ped.addAmmo(ped, weaponHash, amount)
  AddAmmoToPed(ped, weaponHash, amount)
end

-- ─────────────────────────────────────────
-- TASKS & AI
-- ─────────────────────────────────────────

function MORP.ped.task.walkTo(ped, coords, speed)
  TaskGoToCoordAnyMeans(ped, coords.x, coords.y, coords.z, speed or 1.0, 0, false, 786603, 0)
end

function MORP.ped.task.runTo(ped, coords)
  TaskGoToCoordAnyMeans(ped, coords.x, coords.y, coords.z, 3.0, 0, false, 786603, 0)
end

function MORP.ped.task.followEntity(ped, target, dist)
  TaskFollowToOffsetOfEntity(ped, target, 0.0, dist or -1.5, 0.0, -1, 15.0, 1.0, true)
end

function MORP.ped.task.standStill(ped, durationMs)
  TaskStandStill(ped, durationMs or -1)
end

function MORP.ped.task.playScenario(ped, scenarioName)
  TaskStartScenarioInPlace(ped, scenarioName, 0, true)
end

function MORP.ped.task.clearAll(ped)
  ClearPedTasks(ped)
end

function MORP.ped.task.combatTarget(ped, targetPed)
  TaskCombatPed(ped, targetPed, 0, 16)
end

function MORP.ped.task.fleeFrom(ped, threatPed)
  TaskSmartFleePed(ped, threatPed, 200.0, -1, false, false)
end

function MORP.ped.task.shootAt(ped, targetPed, durationMs)
  TaskShootAtEntity(ped, targetPed, durationMs or 5000, GetHashKey('FIRING_PATTERN_FULL_AUTO'))
end

function MORP.ped.task.enterVehicle(ped, veh, seatId)
  TaskEnterVehicle(ped, veh, -1, seatId or -1, 2.0, 1, 0)
end

function MORP.ped.task.leaveVehicle(ped)
  TaskLeaveVehicle(ped, GetVehiclePedIsIn(ped, false), 0)
end

function MORP.ped.task.driveVehicle(ped, veh, targetCoords, speed, drivingStyle)
  TaskVehicleDriveToCoordLongrange(
    ped, veh,
    targetCoords.x, targetCoords.y, targetCoords.z,
    speed or 20.0,
    drivingStyle or 786603,
    5.0
  )
end

-- ─────────────────────────────────────────
-- ANIMATIONS
-- ─────────────────────────────────────────

function MORP.ped.playAnim(ped, dict, anim, blendIn, blendOut, duration, flag)
  MORP.ped.loadAnimDict(dict, function()
    TaskPlayAnim(
      ped, dict, anim,
      blendIn   or 8.0,
      blendOut  or -8.0,
      duration  or -1,
      flag      or 0,
      0, false, false, false
    )
  end)
end

function MORP.ped.stopAnim(ped, dict, anim)
  StopAnimTask(ped, dict, anim, 1.0)
end

function MORP.ped.isPlayingAnim(ped, dict, anim)
  return IsEntityPlayingAnim(ped, dict, anim, 3)
end

function MORP.ped.loadAnimDict(dict, callback)
  if HasAnimDictLoaded(dict) then
    callback()
    return
  end

  RequestAnimDict(dict)
  Citizen.CreateThread(function()
    local timeout = 5000
    local elapsed = 0
    while not HasAnimDictLoaded(dict) do
      Citizen.Wait(50)
      elapsed = elapsed + 50
      if elapsed >= timeout then
        MORP.log.error(('ped.loadAnimDict: timed out loading "%s"'):format(dict))
        return
      end
    end
    callback()
  end)
end

function MORP.ped.isAnimDictLoaded(dict)
  return HasAnimDictLoaded(dict)
end

-- ─────────────────────────────────────────
-- APPEARANCE
-- ─────────────────────────────────────────

function MORP.ped.setComponent(ped, componentId, drawableId, textureId)
  SetPedComponentVariation(ped, componentId, drawableId, textureId or 0, 0)
end

function MORP.ped.setProp(ped, propId, drawableId, textureId)
  SetPedPropIndex(ped, propId, drawableId, textureId or 0, true)
end

function MORP.ped.clearProp(ped, propId)
  ClearPedProp(ped, propId)
end

function MORP.ped.clearAllProps(ped)
  ClearAllPedProps(ped)
end

function MORP.ped.setFaceFeature(ped, featureId, scale)
  SetPedFaceFeature(ped, featureId, scale)
end

function MORP.ped.setHeadBlend(ped, shapeFirst, shapeSecond, shapeThird,
  skinFirst, skinSecond, skinThird,
  shapeMix, skinMix, thirdMix, isParent)
  SetPedHeadBlendData(
    ped,
    shapeFirst or 0, shapeSecond or 0, shapeThird or 0,
    skinFirst  or 0, skinSecond  or 0, skinThird  or 0,
    shapeMix   or 0.0, skinMix   or 0.0, thirdMix or 0.0,
    isParent   or false
  )
end

MORP.log.debug('Ped API module loaded')
