# MORP Protocol Specification
**Version:** 0.2.0
**Status:** Draft
**Full Name:** Modding Open Resource Protocol

---

## Abstract

MORP defines a platform-agnostic scripting interface for GTA V multiplayer modding environments. Any platform implementing this specification allows resources written against it to run without modification.

---

## 1. Terminology

- **Platform** — a GTA V multiplayer runtime (e.g. FiveM, a future alternative)
- **Resource** — a scripting package that runs on a platform
- **Adapter** — a shim library that maps MORP calls to a platform's native API
- **Protocol Version** — semver string declared in `morp.json`
- **Compliant** — a resource or platform that fully implements this spec version

---

## 2. Resource Manifest — `morp.json`

Every MORP resource must include a `morp.json` in its root directory.

```json
{
  "name": "my-resource",
  "version": "1.0.0",
  "protocol": "0.1",
  "author": "YourName",
  "description": "What this resource does",
  "license": "MIT",
  "exports": ["getBalance", "setBalance"],
  "dependencies": ["morp-core"],
  "scripts": {
    "server": ["server.lua"],
    "client": ["client.lua"],
    "shared": ["shared.lua"]
  },
  "signature": ""
}
```

### Required fields
`name`, `version`, `protocol`, `scripts`

### Optional fields
`author`, `description`, `license`, `exports`, `dependencies`, `signature`

---

## 3. Lifecycle Events

All compliant resources may hook into the following events:

| Event               | Side          | Description                         |
|---------------------|---------------|-------------------------------------|
| `start`             | server+client | Resource has started                |
| `stop`              | server+client | Resource is stopping                |
| `playerConnect`     | server        | A player is connecting              |
| `playerDisconnect`  | server        | A player has disconnected           |
| `playerSpawn`       | server+client | A player has spawned into the world |
| `clientReady`       | client        | Client-side scripts fully loaded    |

```lua
MORP.on('playerConnect', function()
  local src = source
  print(MORP.player.getName(src))
end)
```

---

## 4. Event Bus

### 4.1 Local Events
```lua
MORP.emit(event, ...)
MORP.on(event, handler)
MORP.off(event, handler)
```

### 4.2 Network Events
```lua
-- Server → specific client
MORP.emitClient(player, event, ...)

-- Client → server
MORP.emitServer(event, ...)

-- Server → all clients
MORP.emitAllClients(event, ...)

-- Server → all clients except one
MORP.emitAllClientsExcept(player, event, ...)
```

---

## 5. Player API

### 5.1 Server-side
```lua
MORP.player.getName(source)          -- string
MORP.player.getId(source)            -- number
MORP.player.getIdentifiers(source)   -- table { steam, license, discord, ip }
MORP.player.getPing(source)          -- number (ms)
MORP.player.kick(source, reason)     -- void
MORP.player.getAll()                 -- table of source numbers
MORP.player.getBucket(source)        -- number (routing bucket)
MORP.player.setBucket(source, bucket)-- void
```

### 5.2 Client-side
```lua
MORP.player.local()      -- local player id
MORP.player.getPed()     -- ped entity handle
MORP.player.getCoords()  -- vector3
MORP.player.getHeading() -- number (degrees)
```

---

## 6. State / KV Store

### 6.1 Global State (server-writable, replicated)
```lua
MORP.state.set(key, value)
MORP.state.get(key)
MORP.state.delete(key)
```

### 6.2 Player State (server-writable, replicated to owner)
```lua
MORP.state.player(source).set(key, value)
MORP.state.player(source).get(key)
MORP.state.player(source).delete(key)
```

### 6.3 Entity State
```lua
MORP.state.entity(entity).set(key, value)
MORP.state.entity(entity).get(key)
```

---

## 7. Exports / Imports

```lua
-- Declare an export
MORP.export('getBalance', function(playerId)
  return 5000
end)

-- Consume from another resource
local bal = MORP.import('economy', 'getBalance')(playerId)
```

---

## 8. Callbacks

Async request/response between server and client.

```lua
-- Server: register a callback
MORP.callback.register('myres:getData', function(source, cb, arg1)
  cb({ result = 'ok', value = arg1 })
end)

-- Client: call the callback
MORP.callback.trigger('myres:getData', function(data)
  print(data.result)
end, myArg)
```

---

## 9. Scheduler

```lua
MORP.every(intervalMs, function() end)   -- repeating timer
MORP.after(delayMs, function() end)      -- one-shot timer
MORP.nextTick(function() end)            -- next frame
MORP.cancel(timerId)                     -- cancel a timer
```

---

## 10. Logging

```lua
MORP.log.info(msg)
MORP.log.warn(msg)
MORP.log.error(msg)
MORP.log.debug(msg)   -- only shown when MORP_DEBUG=true
```

---

## 11. Resource Signing

MORP resources use **Ed25519** (RFC 8032) for cryptographic signing.

### 11.1 Key Generation

```bash
morp keygen [outDir]
```

Outputs:
- `morp_private.pem` — PKCS#8 private key (keep secret, never commit)
- `morp_public.pem`  — SPKI public key (distribute to servers/players)
- `morp_key.json`    — key metadata including keyId

### 11.2 Signing Workflow

```bash
morp build          # hash all declared scripts + morp.json
morp sign --key morp_private.pem
```

The `morp.sig` file produced:

```json
{
  "algorithm": "Ed25519",
  "keyId":     "40150a2c0ef1a1a9",
  "resource":  "my-resource",
  "version":   "1.0.0",
  "protocol":  "0.2",
  "rootHash":  "<sha256 of sorted file hashes>",
  "signature": "<hex Ed25519 signature over rootHash bytes>",
  "signedAt":  "2026-01-01T00:00:00.000Z"
}
```

### 11.3 Root Hash Construction

The root hash is a deterministic SHA-256 of all resource files:

1. For each declared script + `morp.json`: compute `sha256(fileContent)`
2. Normalize `morp.json` — zero out the `signature` field before hashing
3. Sort entries by file path (lexicographic)
4. Concatenate as `"path:hash\n"` for each entry
5. `rootHash = sha256(concatenated string)`

This ensures the hash is stable across sign/verify cycles and deterministic regardless of file system ordering.

### 11.4 Verification

```bash
morp verify --key morp_public.pem
```

Verification steps:
1. Recompute root hash from files on disk
2. Compare against `rootHash` in `morp.sig` — detects any file modification
3. Verify Ed25519 signature: `verify(null, Buffer.from(rootHash), publicKey, sigBuffer)`

### 11.5 Adapter-side Verification

The MORP adapter auto-verifies resources on `onResourceStart` when:
- The starting resource contains a `morp.json`
- `MORP_AUTO_VERIFY` convar is `true` (default)

Full cryptographic verification requires `morp-native` (Node.js module).
Without it, the adapter performs structural validation and reports `UNVERIFIED`.

---

## 12. Entity API

Entities are world objects: peds, vehicles, props, and generic objects.
All entity functions are **client-side only** unless explicitly noted as server-available.

### 12.1 Core Entity Operations

```lua
-- Create a world object (client)
local entity = MORP.entity.create(modelHash, coords, heading)

-- Delete an entity
MORP.entity.delete(entity)

-- Check if entity is valid
MORP.entity.isValid(entity)       -- bool

-- Check if entity exists
MORP.entity.exists(entity)        -- bool
```

### 12.2 Transform

```lua
MORP.entity.getCoords(entity)              -- vector3
MORP.entity.setCoords(entity, x, y, z)    -- void

MORP.entity.getHeading(entity)             -- number (degrees)
MORP.entity.setHeading(entity, heading)    -- void

MORP.entity.getVelocity(entity)            -- vector3
MORP.entity.setVelocity(entity, x, y, z)  -- void

MORP.entity.getRotation(entity)            -- vector3 (pitch, roll, yaw)
MORP.entity.setRotation(entity, p, r, y)  -- void
```

### 12.3 Properties

```lua
MORP.entity.getModel(entity)               -- number (hash)
MORP.entity.getType(entity)                -- string: 'ped' | 'vehicle' | 'object'

MORP.entity.isVisible(entity)              -- bool
MORP.entity.setVisible(entity, bool)       -- void

MORP.entity.isInvincible(entity)           -- bool
MORP.entity.setInvincible(entity, bool)    -- void

MORP.entity.getHealth(entity)              -- number
MORP.entity.setHealth(entity, health)      -- void

MORP.entity.getMaxHealth(entity)           -- number
MORP.entity.setMaxHealth(entity, max)      -- void

MORP.entity.isDead(entity)                 -- bool
MORP.entity.isAlive(entity)                -- bool

MORP.entity.freeze(entity, bool)           -- freeze/unfreeze position
MORP.entity.setNoCollision(entity, bool)   -- toggle collisions
```

### 12.4 Attachment

```lua
-- Attach one entity to another
MORP.entity.attach(entity, target, boneIndex, ox, oy, oz, rx, ry, rz)

-- Detach entity
MORP.entity.detach(entity)

-- Check if attached
MORP.entity.isAttached(entity)             -- bool
MORP.entity.getAttachedTo(entity)          -- entity handle | nil
```

### 12.5 Network / Ownership (server-side)

```lua
-- Get the network ID of an entity
MORP.entity.getNetId(entity)               -- number

-- Get entity from network ID
MORP.entity.fromNetId(netId)               -- entity handle

-- Get the owner (player source) of an entity
MORP.entity.getOwner(entity)               -- source number

-- Set entity as mission entity (persist ownership)
MORP.entity.setAsMission(entity, bool)     -- void
```

### 12.6 Model Loading (client-side)

```lua
-- Request model and wait for load (async)
MORP.entity.loadModel(modelHash, callback)

-- Check if model loaded
MORP.entity.isModelLoaded(modelHash)       -- bool

-- Release model from memory
MORP.entity.releaseModel(modelHash)        -- void
```

---

## 13. Vehicle API

Vehicles are a specialised entity type. All vehicle functions extend the base entity API.

### 13.1 Spawning (client-side)

```lua
-- Spawn a vehicle at coords with heading
local veh = MORP.vehicle.spawn(modelHash, coords, heading)

-- Spawn with full options
local veh = MORP.vehicle.spawn(modelHash, coords, heading, {
  plate       = 'MORP001',
  color       = { primary = 0, secondary = 0 },
  fuel        = 100.0,
  engineOn    = false,
  networked   = true,
})

-- Delete a vehicle
MORP.vehicle.delete(veh)
```

### 13.2 Identity

```lua
MORP.vehicle.getPlate(veh)                 -- string
MORP.vehicle.setPlate(veh, plate)          -- void

MORP.vehicle.getModel(veh)                 -- number (hash)
MORP.vehicle.getDisplayName(veh)           -- string (e.g. "Sultan RS")

MORP.vehicle.getClass(veh)                 -- number (0–22)
MORP.vehicle.getClassName(veh)             -- string (e.g. "Sports")
```

### 13.3 Engine & Fuel

```lua
MORP.vehicle.isEngineOn(veh)               -- bool
MORP.vehicle.setEngineOn(veh, bool)        -- void

MORP.vehicle.getFuel(veh)                  -- number (0–100)
MORP.vehicle.setFuel(veh, level)           -- void (0–100)

MORP.vehicle.getEngineHealth(veh)          -- number (0–1000)
MORP.vehicle.setEngineHealth(veh, health)  -- void

MORP.vehicle.getBodyHealth(veh)            -- number (0–1000)
MORP.vehicle.setBodyHealth(veh, health)    -- void
```

### 13.4 Doors, Windows, Tyres

```lua
-- Doors: 0=front-left 1=front-right 2=rear-left 3=rear-right 4=hood 5=trunk
MORP.vehicle.getDoorState(veh, doorId)           -- number
MORP.vehicle.setDoorOpen(veh, doorId, loose)     -- void
MORP.vehicle.setDoorClosed(veh, doorId)          -- void
MORP.vehicle.breakDoor(veh, doorId)              -- void

-- Windows
MORP.vehicle.rollDownWindow(veh, windowId)       -- void
MORP.vehicle.rollUpWindow(veh, windowId)         -- void
MORP.vehicle.smashWindow(veh, windowId)          -- void

-- Tyres: 0–5 indexed
MORP.vehicle.isTyreBurst(veh, tyreId)            -- bool
MORP.vehicle.burstTyre(veh, tyreId)              -- void
MORP.vehicle.fixTyre(veh, tyreId)                -- void
```

### 13.5 Appearance

```lua
MORP.vehicle.getColors(veh)                -- { primary, secondary }
MORP.vehicle.setColors(veh, primary, secondary) -- void (color index)
MORP.vehicle.setCustomColor(veh, r, g, b)  -- void (RGB, primary)

MORP.vehicle.getLivery(veh)                -- number
MORP.vehicle.setLivery(veh, index)         -- void

MORP.vehicle.setMod(veh, modType, modIndex) -- void
MORP.vehicle.getMod(veh, modType)           -- number

MORP.vehicle.setNeonEnabled(veh, left, right, front, back) -- void
MORP.vehicle.setNeonColor(veh, r, g, b)    -- void

MORP.vehicle.setWindowTint(veh, tint)      -- void (0–6)
MORP.vehicle.setTyreSmokeColor(veh, r, g, b) -- void
```

### 13.6 Occupants

```lua
MORP.vehicle.getDriver(veh)                -- ped handle | nil
MORP.vehicle.getOccupants(veh)             -- table of ped handles
MORP.vehicle.getSeatOccupant(veh, seatId)  -- ped handle | nil
MORP.vehicle.getMaxPassengers(veh)         -- number
MORP.vehicle.isSeatFree(veh, seatId)       -- bool
```

### 13.7 State

```lua
MORP.vehicle.isLocked(veh)                 -- bool
MORP.vehicle.setLocked(veh, state)         -- void (0=none 1=unlocked 2=locked)

MORP.vehicle.isSirenOn(veh)                -- bool
MORP.vehicle.setSirenOn(veh, bool)         -- void

MORP.vehicle.isOnAllWheels(veh)            -- bool
MORP.vehicle.hasStalled(veh)               -- bool

MORP.vehicle.repair(veh)                   -- full repair (engine, body, tyres)
MORP.vehicle.explode(veh)                  -- void

MORP.vehicle.getSpeed(veh)                 -- number (m/s)
MORP.vehicle.getSpeedKph(veh)              -- number (km/h)
MORP.vehicle.getSpeedMph(veh)              -- number (mph)
```

---

## 14. Ped API

Peds include both player characters and NPCs.

### 14.1 Spawning (client-side)

```lua
-- Spawn an NPC ped
local ped = MORP.ped.spawn(modelHash, coords, heading, {
  networked  = false,
  scenario   = nil,    -- string scenario name, optional
  freeze     = false,
  invincible = false,
})

-- Delete a ped
MORP.ped.delete(ped)
```

### 14.2 Identity & State

```lua
MORP.ped.getType(ped)                      -- string: 'player' | 'npc'
MORP.ped.getModel(ped)                     -- number (hash)

MORP.ped.isInVehicle(ped)                  -- bool
MORP.ped.getVehicle(ped)                   -- vehicle handle | nil
MORP.ped.getCurrentSeat(ped)               -- number | nil

MORP.ped.isOnFoot(ped)                     -- bool
MORP.ped.isDead(ped)                       -- bool
MORP.ped.isInjured(ped)                    -- bool
MORP.ped.isInCombat(ped)                   -- bool
MORP.ped.isAiming(ped)                     -- bool
MORP.ped.isReloading(ped)                  -- bool
MORP.ped.isFalling(ped)                    -- bool
MORP.ped.isSwimming(ped)                   -- bool
MORP.ped.isRagdoll(ped)                    -- bool
```

### 14.3 Health & Armour

```lua
MORP.ped.getHealth(ped)                    -- number (0–200, 100=alive threshold)
MORP.ped.setHealth(ped, health)            -- void
MORP.ped.getMaxHealth(ped)                 -- number
MORP.ped.setMaxHealth(ped, max)            -- void

MORP.ped.getArmour(ped)                    -- number (0–100)
MORP.ped.setArmour(ped, armour)            -- void
MORP.ped.addArmour(ped, amount)            -- void
```

### 14.4 Weapons

```lua
MORP.ped.giveWeapon(ped, weaponHash, ammo, equip) -- void
MORP.ped.removeWeapon(ped, weaponHash)     -- void
MORP.ped.removeAllWeapons(ped)             -- void

MORP.ped.hasWeapon(ped, weaponHash)        -- bool
MORP.ped.getCurrentWeapon(ped)             -- number (hash)
MORP.ped.setCurrentWeapon(ped, weaponHash) -- void

MORP.ped.getAmmo(ped, weaponHash)          -- number
MORP.ped.setAmmo(ped, weaponHash, ammo)    -- void
MORP.ped.addAmmo(ped, weaponHash, amount)  -- void
```

### 14.5 Tasks & AI (NPC)

```lua
-- Movement
MORP.ped.task.walkTo(ped, coords, speed)         -- void
MORP.ped.task.runTo(ped, coords)                 -- void
MORP.ped.task.followEntity(ped, target, dist)    -- void
MORP.ped.task.standStill(ped, durationMs)        -- void
MORP.ped.task.playScenario(ped, scenarioName)    -- void
MORP.ped.task.clearAll(ped)                      -- void

-- Combat
MORP.ped.task.combatTarget(ped, targetPed)       -- void
MORP.ped.task.fleeFrom(ped, threatPed)           -- void
MORP.ped.task.shootAt(ped, targetPed, durationMs) -- void

-- Entering / exiting vehicles
MORP.ped.task.enterVehicle(ped, veh, seatId)     -- void
MORP.ped.task.leaveVehicle(ped)                  -- void
MORP.ped.task.driveVehicle(ped, veh, targetCoords, speed, drivingStyle) -- void
```

### 14.6 Animations

```lua
-- Play animation
MORP.ped.playAnim(ped, dict, anim, blendIn, blendOut, duration, flag)

-- Stop animation
MORP.ped.stopAnim(ped, dict, anim)

-- Check if playing
MORP.ped.isPlayingAnim(ped, dict, anim)    -- bool

-- Load anim dict
MORP.ped.loadAnimDict(dict, callback)
MORP.ped.isAnimDictLoaded(dict)            -- bool
```

### 14.7 Appearance (client-side)

```lua
MORP.ped.setComponent(ped, componentId, drawableId, textureId) -- void
MORP.ped.setProp(ped, propId, drawableId, textureId)           -- void
MORP.ped.clearProp(ped, propId)                                -- void
MORP.ped.clearAllProps(ped)                                    -- void
MORP.ped.setFaceFeature(ped, featureId, scale)                 -- void (-1.0 to 1.0)
MORP.ped.setHeadBlend(ped, ...) -- full head blend params
```

---

## 15. Platform Compliance

A platform is MORP-compliant if it:

1. Implements Sections 3–14 fully
2. Parses and respects `morp.json`
3. Ships a `MORP_COMPAT.json` declaring supported protocol version

### `MORP_COMPAT.json`
```json
{
  "platform": "FiveM",
  "protocol_min": "0.1",
  "protocol_max": "0.2",
  "modules": [
    "lifecycle", "events", "player", "state",
    "exports", "callbacks", "scheduler",
    "entity", "vehicle", "ped"
  ]
}
```

---

## 16. Versioning

MORP follows semantic versioning.

- **Patch** — clarifications, no API changes
- **Minor** — new optional APIs added
- **Major** — breaking changes, 90-day deprecation notice required

Adapters must declare the minimum and maximum protocol versions they support.

### Changelog

| Version | Changes |
|---------|---------|
| 0.2.0   | Added Entity API (§12), Vehicle API (§13), Ped API (§14) |
| 0.1.0   | Initial draft — lifecycle, events, player, state, exports, callbacks, scheduler |
