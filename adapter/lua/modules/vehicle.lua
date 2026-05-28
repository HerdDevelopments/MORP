--[[
  MORP Vehicle API — FiveM Lua Adapter Module
  Protocol: 0.2.0
  Spec: Section 13
]]

MORP.vehicle = {}

local function isServer() return IsDuplicityVersion() end

-- Vehicle class index → name map
local CLASS_NAMES = {
  [0]='Compacts',[1]='Sedans',[2]='SUVs',[3]='Coupes',[4]='Muscle',
  [5]='Sports Classics',[6]='Sports',[7]='Super',[8]='Motorcycles',
  [9]='Off-road',[10]='Industrial',[11]='Utility',[12]='Vans',
  [13]='Cycles',[14]='Boats',[15]='Helicopters',[16]='Planes',
  [17]='Service',[18]='Emergency',[19]='Military',[20]='Commercial',
  [21]='Trains',[22]='Open Wheel',
}

-- ─────────────────────────────────────────
-- SPAWNING
-- ─────────────────────────────────────────

function MORP.vehicle.spawn(modelHash, coords, heading, options)
  if isServer() then
    MORP.log.warn('vehicle.spawn is client-side only — use server events to request spawns')
    return nil
  end

  options = options or {}

  MORP.entity.loadModel(modelHash, function()
    -- actual spawn happens in callback, caller should handle via loadModel pattern
  end)

  local veh = CreateVehicle(
    modelHash,
    coords.x, coords.y, coords.z,
    heading or 0.0,
    options.networked ~= false,   -- default true
    false
  )

  if not DoesEntityExist(veh) then
    MORP.log.error('vehicle.spawn: failed to create vehicle')
    return nil
  end

  SetVehicleOnGroundProperly(veh)

  if options.plate then
    SetVehicleNumberPlateText(veh, options.plate)
  end

  if options.color then
    local c = options.color
    SetVehicleColours(veh, c.primary or 0, c.secondary or 0)
  end

  if options.fuel then
    SetVehicleFuelLevel(veh, options.fuel)
  end

  if options.engineOn ~= nil then
    SetVehicleEngineOn(veh, options.engineOn, true, true)
  end

  SetEntityAsMissionEntity(veh, true, true)
  SetModelAsNoLongerNeeded(modelHash)

  return veh
end

function MORP.vehicle.delete(veh)
  MORP.entity.delete(veh)
end

-- ─────────────────────────────────────────
-- IDENTITY
-- ─────────────────────────────────────────

function MORP.vehicle.getPlate(veh)
  return GetVehicleNumberPlateText(veh)
end

function MORP.vehicle.setPlate(veh, plate)
  SetVehicleNumberPlateText(veh, plate)
end

function MORP.vehicle.getModel(veh)
  return GetEntityModel(veh)
end

function MORP.vehicle.getDisplayName(veh)
  return GetLabelText(GetDisplayNameFromVehicleModel(GetEntityModel(veh)))
end

function MORP.vehicle.getClass(veh)
  return GetVehicleClass(veh)
end

function MORP.vehicle.getClassName(veh)
  return CLASS_NAMES[GetVehicleClass(veh)] or 'Unknown'
end

-- ─────────────────────────────────────────
-- ENGINE & FUEL
-- ─────────────────────────────────────────

function MORP.vehicle.isEngineOn(veh)
  return GetIsVehicleEngineRunning(veh)
end

function MORP.vehicle.setEngineOn(veh, on)
  SetVehicleEngineOn(veh, on, true, true)
end

function MORP.vehicle.getFuel(veh)
  return GetVehicleFuelLevel(veh)
end

function MORP.vehicle.setFuel(veh, level)
  SetVehicleFuelLevel(veh, math.min(100.0, math.max(0.0, level)))
end

function MORP.vehicle.getEngineHealth(veh)
  return GetVehicleEngineHealth(veh)
end

function MORP.vehicle.setEngineHealth(veh, health)
  SetVehicleEngineHealth(veh, health)
end

function MORP.vehicle.getBodyHealth(veh)
  return GetVehicleBodyHealth(veh)
end

function MORP.vehicle.setBodyHealth(veh, health)
  SetVehicleBodyHealth(veh, health)
end

-- ─────────────────────────────────────────
-- DOORS, WINDOWS, TYRES
-- ─────────────────────────────────────────

function MORP.vehicle.getDoorState(veh, doorId)
  return GetVehicleDoorAngleRatio(veh, doorId)
end

function MORP.vehicle.setDoorOpen(veh, doorId, loose)
  SetVehicleDoorOpen(veh, doorId, loose or false, false)
end

function MORP.vehicle.setDoorClosed(veh, doorId)
  SetVehicleDoorShut(veh, doorId, false)
end

function MORP.vehicle.breakDoor(veh, doorId)
  SetVehicleDoorBroken(veh, doorId, true)
end

function MORP.vehicle.rollDownWindow(veh, windowId)
  RollDownWindow(veh, windowId)
end

function MORP.vehicle.rollUpWindow(veh, windowId)
  RollUpWindow(veh, windowId)
end

function MORP.vehicle.smashWindow(veh, windowId)
  SmashVehicleWindow(veh, windowId)
end

function MORP.vehicle.isTyreBurst(veh, tyreId)
  return IsVehicleTyreBurst(veh, tyreId, false)
end

function MORP.vehicle.burstTyre(veh, tyreId)
  SetVehicleTyreBurst(veh, tyreId, true, 1000.0)
end

function MORP.vehicle.fixTyre(veh, tyreId)
  SetVehicleTyreFixed(veh, tyreId)
end

-- ─────────────────────────────────────────
-- APPEARANCE
-- ─────────────────────────────────────────

function MORP.vehicle.getColors(veh)
  local p, s = GetVehicleColours(veh)
  return { primary = p, secondary = s }
end

function MORP.vehicle.setColors(veh, primary, secondary)
  SetVehicleColours(veh, primary, secondary)
end

function MORP.vehicle.setCustomColor(veh, r, g, b)
  SetVehicleCustomPrimaryColour(veh, r, g, b)
end

function MORP.vehicle.getLivery(veh)
  return GetVehicleLivery(veh)
end

function MORP.vehicle.setLivery(veh, index)
  SetVehicleLivery(veh, index)
end

function MORP.vehicle.setMod(veh, modType, modIndex)
  SetVehicleMod(veh, modType, modIndex, false)
end

function MORP.vehicle.getMod(veh, modType)
  return GetVehicleMod(veh, modType)
end

function MORP.vehicle.setNeonEnabled(veh, left, right, front, back)
  SetVehicleNeonLightEnabled(veh, 0, left  or false)
  SetVehicleNeonLightEnabled(veh, 1, right or false)
  SetVehicleNeonLightEnabled(veh, 2, front or false)
  SetVehicleNeonLightEnabled(veh, 3, back  or false)
end

function MORP.vehicle.setNeonColor(veh, r, g, b)
  SetVehicleNeonLightsColour(veh, r, g, b)
end

function MORP.vehicle.setWindowTint(veh, tint)
  SetVehicleWindowTint(veh, tint)
end

function MORP.vehicle.setTyreSmokeColor(veh, r, g, b)
  SetVehicleTyreSmokeColor(veh, r, g, b)
end

-- ─────────────────────────────────────────
-- OCCUPANTS
-- ─────────────────────────────────────────

function MORP.vehicle.getDriver(veh)
  local ped = GetPedInVehicleSeat(veh, -1)
  return ped ~= 0 and ped or nil
end

function MORP.vehicle.getOccupants(veh)
  local max  = GetVehicleMaxNumberOfPassengers(veh)
  local peds = {}
  local driver = GetPedInVehicleSeat(veh, -1)
  if driver ~= 0 then table.insert(peds, driver) end
  for seat = 0, max - 1 do
    local p = GetPedInVehicleSeat(veh, seat)
    if p ~= 0 then table.insert(peds, p) end
  end
  return peds
end

function MORP.vehicle.getSeatOccupant(veh, seatId)
  local ped = GetPedInVehicleSeat(veh, seatId)
  return ped ~= 0 and ped or nil
end

function MORP.vehicle.getMaxPassengers(veh)
  return GetVehicleMaxNumberOfPassengers(veh)
end

function MORP.vehicle.isSeatFree(veh, seatId)
  return IsVehicleSeatFree(veh, seatId)
end

-- ─────────────────────────────────────────
-- STATE
-- ─────────────────────────────────────────

function MORP.vehicle.isLocked(veh)
  return GetVehicleDoorLockStatus(veh) >= 2
end

function MORP.vehicle.setLocked(veh, state)
  SetVehicleDoorsLocked(veh, state)
end

function MORP.vehicle.isSirenOn(veh)
  return IsVehicleSirenOn(veh)
end

function MORP.vehicle.setSirenOn(veh, on)
  SetVehicleSiren(veh, on)
end

function MORP.vehicle.isOnAllWheels(veh)
  return IsVehicleOnAllWheels(veh)
end

function MORP.vehicle.hasStalled(veh)
  return GetVehicleEngineHealth(veh) < 0.0
end

function MORP.vehicle.repair(veh)
  SetVehicleFixed(veh)
  SetVehicleDeformationFixed(veh)
  SetVehicleUndriveable(veh, false)
  SetVehicleEngineOn(veh, true, true, true)
end

function MORP.vehicle.explode(veh)
  NetworkExplodeVehicle(veh, true, false, false)
end

function MORP.vehicle.getSpeed(veh)
  return GetEntitySpeed(veh)
end

function MORP.vehicle.getSpeedKph(veh)
  return GetEntitySpeed(veh) * 3.6
end

function MORP.vehicle.getSpeedMph(veh)
  return GetEntitySpeed(veh) * 2.237
end

MORP.log.debug('Vehicle API module loaded')
