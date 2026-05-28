-- world-demo — client.lua
-- Demonstrates MORP Entity, Vehicle, and Ped APIs (Protocol 0.2.0)

MORP.on('clientReady', function()
  MORP.log.info('world-demo ready')
end)

-- ── Spawn a vehicle on command ────────────────────────────────────
MORP.on('worldDemo:spawnCar', function(modelName)
  local hash   = GetHashKey(modelName or 'sultan')
  local coords = MORP.entity.getCoords(MORP.player.getPed())

  MORP.entity.loadModel(hash, function()
    local veh = MORP.vehicle.spawn(hash, {
      x = coords.x + 3.0,
      y = coords.y,
      z = coords.z,
    }, MORP.entity.getHeading(MORP.player.getPed()), {
      plate    = 'MORP001',
      color    = { primary = 27, secondary = 0 },
      fuel     = 100.0,
      engineOn = false,
    })

    if not veh then return end

    MORP.log.info(('Spawned: %s | Class: %s | Plate: %s'):format(
      MORP.vehicle.getDisplayName(veh),
      MORP.vehicle.getClassName(veh),
      MORP.vehicle.getPlate(veh)
    ))

    -- Apply appearance
    MORP.vehicle.setNeonEnabled(veh, true, true, false, false)
    MORP.vehicle.setNeonColor(veh, 0, 255, 180)
    MORP.vehicle.setWindowTint(veh, 1)

    -- Store net ID in state for server reference
    local netId = MORP.entity.getNetId(veh)
    MORP.emitServer('worldDemo:vehicleSpawned', netId)
  end)
end)

-- ── Repair current vehicle ────────────────────────────────────────
MORP.on('worldDemo:repairVehicle', function()
  local ped = MORP.player.getPed()
  if not MORP.ped.isInVehicle(ped) then
    MORP.log.warn('Not in a vehicle')
    return
  end

  local veh = MORP.ped.getVehicle(ped)
  MORP.vehicle.repair(veh)
  MORP.log.info('Vehicle repaired')
end)

-- ── Spawn an NPC that follows the player ─────────────────────────
MORP.on('worldDemo:spawnFollower', function()
  local playerPed = MORP.player.getPed()
  local coords    = MORP.entity.getCoords(playerPed)
  local hash      = GetHashKey('a_m_y_business_01')

  MORP.entity.loadModel(hash, function()
    local npc = MORP.ped.spawn(hash, {
      x = coords.x + 2.0,
      y = coords.y + 2.0,
      z = coords.z,
    }, 0.0, {
      networked  = false,
      invincible = true,
    })

    if not npc then return end

    -- Give it a weapon
    MORP.ped.giveWeapon(npc, GetHashKey('WEAPON_PISTOL'), 50, false)

    -- Play a greeting anim then follow
    MORP.ped.playAnim(npc, 'gestures@m@standing@casual', 'gesture_hello', 8.0, -8.0, 2000, 0)

    MORP.after(2500, function()
      MORP.ped.task.followEntity(npc, playerPed, 2.0)
      MORP.log.info('NPC follower spawned — health: ' .. MORP.ped.getHealth(npc))
    end)
  end)
end)

-- ── Spawn a prop crate ────────────────────────────────────────────
MORP.on('worldDemo:spawnCrate', function()
  local playerPed = MORP.player.getPed()
  local coords    = MORP.entity.getCoords(playerPed)
  local hash      = GetHashKey('prop_box_wood01a')

  MORP.entity.loadModel(hash, function()
    local crate = MORP.entity.create(hash, {
      x = coords.x + 1.5,
      y = coords.y + 1.5,
      z = coords.z,
    }, 45.0)

    MORP.entity.setInvincible(crate, false)
    MORP.entity.setHealth(crate, 500)

    -- Store some state on the entity
    MORP.state.entity(crate).set('type', 'supply_crate')
    MORP.state.entity(crate).set('loot', { cash = 500, ammo = 30 })

    MORP.log.info('Crate spawned — type: ' .. tostring(MORP.state.entity(crate).get('type')))
  end)
end)

-- ── Debug: print player ped info ──────────────────────────────────
MORP.on('worldDemo:debugPed', function()
  local ped = MORP.player.getPed()

  MORP.log.info('=== PED DEBUG ===')
  MORP.log.info('Health:    ' .. MORP.ped.getHealth(ped))
  MORP.log.info('Armour:    ' .. MORP.ped.getArmour(ped))
  MORP.log.info('In vehicle: ' .. tostring(MORP.ped.isInVehicle(ped)))
  MORP.log.info('Is dead:   ' .. tostring(MORP.ped.isDead(ped)))
  MORP.log.info('Is falling: ' .. tostring(MORP.ped.isFalling(ped)))

  local coords = MORP.player.getCoords()
  MORP.log.info(('Coords: %.2f, %.2f, %.2f'):format(coords.x, coords.y, coords.z))

  if MORP.ped.isInVehicle(ped) then
    local veh = MORP.ped.getVehicle(ped)
    MORP.log.info('Vehicle:   ' .. MORP.vehicle.getDisplayName(veh))
    MORP.log.info('Speed kph: ' .. math.floor(MORP.vehicle.getSpeedKph(veh)))
    MORP.log.info('Fuel:      ' .. math.floor(MORP.vehicle.getFuel(veh)) .. '%')
    MORP.log.info('Engine:    ' .. tostring(MORP.vehicle.isEngineOn(veh)))
  end
end)
