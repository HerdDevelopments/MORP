/**
 * MORP Entity + Vehicle + Ped API — FiveM TypeScript Module
 * Protocol: 0.2.0
 * Spec: Sections 12, 13, 14
 *
 * Import into your resource:
 *   import { entity, vehicle, ped } from '@morp-core/adapter/ts/modules/world'
 */

import { log } from '../morp_adapter';

declare function IsDuplicityVersion(): boolean;
const isServer = typeof IsDuplicityVersion === 'function' && IsDuplicityVersion();

export type EntityHandle  = number;
export type VehicleHandle = number;
export type PedHandle     = number;

export interface Vec3 { x: number; y: number; z: number }
export interface VehicleColors { primary: number; secondary: number }

export interface SpawnVehicleOptions {
  plate?:     string;
  color?:     { primary?: number; secondary?: number };
  fuel?:      number;
  engineOn?:  boolean;
  networked?: boolean;
}

export interface SpawnPedOptions {
  networked?:  boolean;
  scenario?:   string;
  freeze?:     boolean;
  invincible?: boolean;
}

// ─────────────────────────────────────────────────────────────
// ENTITY API
// ─────────────────────────────────────────────────────────────

export const entity = {

  // ── Core ──────────────────────────────────────────
  create: (modelHash: number, coords: Vec3, heading = 0): EntityHandle => {
    if (isServer) { log.warn('entity.create is client-side only'); return 0; }
    const ent = CreateObject(modelHash, coords.x, coords.y, coords.z, true, true, false);
    SetEntityHeading(ent, heading);
    return ent;
  },

  delete: (ent: EntityHandle): void => {
    if (DoesEntityExist(ent)) {
      SetEntityAsMissionEntity(ent, false, true);
      DeleteEntity(ent);
    }
  },

  isValid:  (ent: EntityHandle): boolean => ent != null && ent !== 0,
  exists:   (ent: EntityHandle): boolean => DoesEntityExist(ent),

  // ── Transform ─────────────────────────────────────
  getCoords:    (ent: EntityHandle): Vec3 => {
    const [x, y, z] = GetEntityCoords(ent, true);
    return { x, y, z };
  },
  setCoords:    (ent: EntityHandle, x: number, y: number, z: number): void =>
    SetEntityCoords(ent, x, y, z, false, false, false, false),

  getHeading:   (ent: EntityHandle): number => GetEntityHeading(ent),
  setHeading:   (ent: EntityHandle, h: number): void => SetEntityHeading(ent, h),

  getVelocity:  (ent: EntityHandle): Vec3 => {
    const [x, y, z] = GetEntityVelocity(ent);
    return { x, y, z };
  },
  setVelocity:  (ent: EntityHandle, x: number, y: number, z: number): void =>
    SetEntityVelocity(ent, x, y, z),

  getRotation:  (ent: EntityHandle): Vec3 => {
    const [x, y, z] = GetEntityRotation(ent, 2);
    return { x, y, z };
  },
  setRotation:  (ent: EntityHandle, p: number, r: number, y: number): void =>
    SetEntityRotation(ent, p, r, y, 2, true),

  // ── Properties ────────────────────────────────────
  getModel:       (ent: EntityHandle): number  => GetEntityModel(ent),
  getType:        (ent: EntityHandle): string  => {
    const t = GetEntityType(ent);
    return t === 1 ? 'ped' : t === 2 ? 'vehicle' : t === 3 ? 'object' : 'unknown';
  },

  isVisible:      (ent: EntityHandle): boolean => IsEntityVisible(ent),
  setVisible:     (ent: EntityHandle, v: boolean): void => SetEntityVisible(ent, v, false),
  isInvincible:   (ent: EntityHandle): boolean => GetEntityInvincible(ent),
  setInvincible:  (ent: EntityHandle, v: boolean): void => SetEntityInvincible(ent, v),

  getHealth:    (ent: EntityHandle): number => GetEntityHealth(ent),
  setHealth:    (ent: EntityHandle, h: number): void => SetEntityHealth(ent, h),
  getMaxHealth: (ent: EntityHandle): number => GetEntityMaxHealth(ent),
  setMaxHealth: (ent: EntityHandle, h: number): void => SetEntityMaxHealth(ent, h),

  isDead:   (ent: EntityHandle): boolean => IsEntityDead(ent),
  isAlive:  (ent: EntityHandle): boolean => !IsEntityDead(ent),
  freeze:   (ent: EntityHandle, v: boolean): void => FreezeEntityPosition(ent, v),
  setNoCollision: (ent: EntityHandle, v: boolean): void => SetEntityCollision(ent, !v, true),

  // ── Attachment ────────────────────────────────────
  attach: (
    ent: EntityHandle, target: EntityHandle,
    bone = 0, ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0
  ): void =>
    AttachEntityToEntity(ent, target, bone, ox, oy, oz, rx, ry, rz, false, false, false, false, 2, true),

  detach:       (ent: EntityHandle): void    => DetachEntity(ent, true, true),
  isAttached:   (ent: EntityHandle): boolean => IsEntityAttached(ent),
  getAttachedTo:(ent: EntityHandle): EntityHandle | null =>
    IsEntityAttached(ent) ? GetEntityAttachedTo(ent) : null,

  // ── Network ───────────────────────────────────────
  getNetId:     (ent: EntityHandle): number        => NetworkGetNetworkIdFromEntity(ent),
  fromNetId:    (id: number): EntityHandle         => NetworkGetEntityFromNetworkId(id),
  getOwner:     (ent: EntityHandle): number | null => {
    if (!isServer) { log.warn('entity.getOwner is server-side only'); return null; }
    return NetworkGetEntityOwner(ent);
  },
  setAsMission: (ent: EntityHandle, v: boolean): void => SetEntityAsMissionEntity(ent, v, true),

  // ── Model loading ─────────────────────────────────
  loadModel: (hash: number, cb: () => void): void => {
    if (isServer) { log.warn('entity.loadModel is client-side only'); return; }
    if (HasModelLoaded(hash)) { cb(); return; }
    RequestModel(hash);
    const interval = setInterval(() => {
      if (HasModelLoaded(hash)) { clearInterval(interval); cb(); }
    }, 50);
  },
  isModelLoaded:  (hash: number): boolean => HasModelLoaded(hash),
  releaseModel:   (hash: number): void    => SetModelAsNoLongerNeeded(hash),
};

// ─────────────────────────────────────────────────────────────
// VEHICLE API
// ─────────────────────────────────────────────────────────────

const CLASS_NAMES: Record<number, string> = {
  0:'Compacts',1:'Sedans',2:'SUVs',3:'Coupes',4:'Muscle',
  5:'Sports Classics',6:'Sports',7:'Super',8:'Motorcycles',
  9:'Off-road',10:'Industrial',11:'Utility',12:'Vans',
  13:'Cycles',14:'Boats',15:'Helicopters',16:'Planes',
  17:'Service',18:'Emergency',19:'Military',20:'Commercial',
  21:'Trains',22:'Open Wheel',
};

export const vehicle = {

  // ── Spawn ─────────────────────────────────────────
  spawn: (hash: number, coords: Vec3, heading = 0, opts: SpawnVehicleOptions = {}): VehicleHandle => {
    if (isServer) { log.warn('vehicle.spawn is client-side only'); return 0; }

    const veh = CreateVehicle(hash, coords.x, coords.y, coords.z, heading, opts.networked !== false, false);
    if (!DoesEntityExist(veh)) { log.error('vehicle.spawn failed'); return 0; }

    SetVehicleOnGroundProperly(veh);
    if (opts.plate)            SetVehicleNumberPlateText(veh, opts.plate);
    if (opts.color)            SetVehicleColours(veh, opts.color.primary ?? 0, opts.color.secondary ?? 0);
    if (opts.fuel != null)     SetVehicleFuelLevel(veh, opts.fuel);
    if (opts.engineOn != null) SetVehicleEngineOn(veh, opts.engineOn, true, true);

    SetEntityAsMissionEntity(veh, true, true);
    SetModelAsNoLongerNeeded(hash);
    return veh;
  },

  delete: (veh: VehicleHandle): void => entity.delete(veh),

  // ── Identity ──────────────────────────────────────
  getPlate:       (veh: VehicleHandle): string => GetVehicleNumberPlateText(veh),
  setPlate:       (veh: VehicleHandle, p: string): void => SetVehicleNumberPlateText(veh, p),
  getModel:       (veh: VehicleHandle): number => GetEntityModel(veh),
  getDisplayName: (veh: VehicleHandle): string =>
    GetLabelText(GetDisplayNameFromVehicleModel(GetEntityModel(veh))),
  getClass:       (veh: VehicleHandle): number => GetVehicleClass(veh),
  getClassName:   (veh: VehicleHandle): string => CLASS_NAMES[GetVehicleClass(veh)] ?? 'Unknown',

  // ── Engine & Fuel ─────────────────────────────────
  isEngineOn:       (veh: VehicleHandle): boolean => GetIsVehicleEngineRunning(veh),
  setEngineOn:      (veh: VehicleHandle, v: boolean): void => SetVehicleEngineOn(veh, v, true, true),
  getFuel:          (veh: VehicleHandle): number => GetVehicleFuelLevel(veh),
  setFuel:          (veh: VehicleHandle, l: number): void => SetVehicleFuelLevel(veh, Math.min(100, Math.max(0, l))),
  getEngineHealth:  (veh: VehicleHandle): number => GetVehicleEngineHealth(veh),
  setEngineHealth:  (veh: VehicleHandle, h: number): void => SetVehicleEngineHealth(veh, h),
  getBodyHealth:    (veh: VehicleHandle): number => GetVehicleBodyHealth(veh),
  setBodyHealth:    (veh: VehicleHandle, h: number): void => SetVehicleBodyHealth(veh, h),

  // ── Doors, Windows, Tyres ─────────────────────────
  getDoorState:   (veh: VehicleHandle, door: number): number => GetVehicleDoorAngleRatio(veh, door),
  setDoorOpen:    (veh: VehicleHandle, door: number, loose = false): void => SetVehicleDoorOpen(veh, door, loose, false),
  setDoorClosed:  (veh: VehicleHandle, door: number): void => SetVehicleDoorShut(veh, door, false),
  breakDoor:      (veh: VehicleHandle, door: number): void => SetVehicleDoorBroken(veh, door, true),
  rollDownWindow: (veh: VehicleHandle, win: number): void  => RollDownWindow(veh, win),
  rollUpWindow:   (veh: VehicleHandle, win: number): void  => RollUpWindow(veh, win),
  smashWindow:    (veh: VehicleHandle, win: number): void  => SmashVehicleWindow(veh, win),
  isTyreBurst:    (veh: VehicleHandle, tyre: number): boolean => IsVehicleTyreBurst(veh, tyre, false),
  burstTyre:      (veh: VehicleHandle, tyre: number): void => SetVehicleTyreBurst(veh, tyre, true, 1000),
  fixTyre:        (veh: VehicleHandle, tyre: number): void => SetVehicleTyreFixed(veh, tyre),

  // ── Appearance ────────────────────────────────────
  getColors:        (veh: VehicleHandle): VehicleColors => {
    const [p, s] = GetVehicleColours(veh);
    return { primary: p, secondary: s };
  },
  setColors:        (veh: VehicleHandle, p: number, s: number): void => SetVehicleColours(veh, p, s),
  setCustomColor:   (veh: VehicleHandle, r: number, g: number, b: number): void => SetVehicleCustomPrimaryColour(veh, r, g, b),
  getLivery:        (veh: VehicleHandle): number => GetVehicleLivery(veh),
  setLivery:        (veh: VehicleHandle, i: number): void => SetVehicleLivery(veh, i),
  setMod:           (veh: VehicleHandle, type: number, index: number): void => SetVehicleMod(veh, type, index, false),
  getMod:           (veh: VehicleHandle, type: number): number => GetVehicleMod(veh, type),
  setNeonEnabled:   (veh: VehicleHandle, l: boolean, r: boolean, f: boolean, b: boolean): void => {
    SetVehicleNeonLightEnabled(veh, 0, l);
    SetVehicleNeonLightEnabled(veh, 1, r);
    SetVehicleNeonLightEnabled(veh, 2, f);
    SetVehicleNeonLightEnabled(veh, 3, b);
  },
  setNeonColor:     (veh: VehicleHandle, r: number, g: number, b: number): void => SetVehicleNeonLightsColour(veh, r, g, b),
  setWindowTint:    (veh: VehicleHandle, t: number): void => SetVehicleWindowTint(veh, t),
  setTyreSmokeColor:(veh: VehicleHandle, r: number, g: number, b: number): void => SetVehicleTyreSmokeColor(veh, r, g, b),

  // ── Occupants ─────────────────────────────────────
  getDriver:        (veh: VehicleHandle): PedHandle | null => {
    const p = GetPedInVehicleSeat(veh, -1);
    return p !== 0 ? p : null;
  },
  getOccupants:     (veh: VehicleHandle): PedHandle[] => {
    const max = GetVehicleMaxNumberOfPassengers(veh);
    const out: PedHandle[] = [];
    const d = GetPedInVehicleSeat(veh, -1);
    if (d !== 0) out.push(d);
    for (let s = 0; s < max; s++) {
      const p = GetPedInVehicleSeat(veh, s);
      if (p !== 0) out.push(p);
    }
    return out;
  },
  getSeatOccupant:  (veh: VehicleHandle, seat: number): PedHandle | null => {
    const p = GetPedInVehicleSeat(veh, seat);
    return p !== 0 ? p : null;
  },
  getMaxPassengers: (veh: VehicleHandle): number  => GetVehicleMaxNumberOfPassengers(veh),
  isSeatFree:       (veh: VehicleHandle, s: number): boolean => IsVehicleSeatFree(veh, s),

  // ── State ─────────────────────────────────────────
  isLocked:    (veh: VehicleHandle): boolean => GetVehicleDoorLockStatus(veh) >= 2,
  setLocked:   (veh: VehicleHandle, s: number): void => SetVehicleDoorsLocked(veh, s),
  isSirenOn:   (veh: VehicleHandle): boolean => IsVehicleSirenOn(veh),
  setSirenOn:  (veh: VehicleHandle, v: boolean): void => SetVehicleSiren(veh, v),
  isOnAllWheels:(veh: VehicleHandle): boolean => IsVehicleOnAllWheels(veh),
  hasStalled:  (veh: VehicleHandle): boolean => GetVehicleEngineHealth(veh) < 0,

  repair:  (veh: VehicleHandle): void => {
    SetVehicleFixed(veh);
    SetVehicleDeformationFixed(veh);
    SetVehicleUndriveable(veh, false);
    SetVehicleEngineOn(veh, true, true, true);
  },
  explode: (veh: VehicleHandle): void => NetworkExplodeVehicle(veh, true, false, false),

  getSpeed:    (veh: VehicleHandle): number => GetEntitySpeed(veh),
  getSpeedKph: (veh: VehicleHandle): number => GetEntitySpeed(veh) * 3.6,
  getSpeedMph: (veh: VehicleHandle): number => GetEntitySpeed(veh) * 2.237,
};

// ─────────────────────────────────────────────────────────────
// PED API
// ─────────────────────────────────────────────────────────────

export const ped = {

  spawn: (hash: number, coords: Vec3, heading = 0, opts: SpawnPedOptions = {}): PedHandle => {
    if (isServer) { log.warn('ped.spawn is client-side only'); return 0; }
    const p = CreatePed(4, hash, coords.x, coords.y, coords.z, heading, opts.networked !== false, false);
    if (!DoesEntityExist(p)) { log.error('ped.spawn failed'); return 0; }
    if (opts.freeze)     FreezeEntityPosition(p, true);
    if (opts.invincible) SetEntityInvincible(p, true);
    if (opts.scenario)   TaskStartScenarioInPlace(p, opts.scenario, 0, true);
    SetModelAsNoLongerNeeded(hash);
    SetEntityAsMissionEntity(p, true, true);
    return p;
  },

  delete: (p: PedHandle): void => entity.delete(p),

  // ── Identity ──────────────────────────────────────
  getType:        (p: PedHandle): 'player' | 'npc' => IsPedAPlayer(p) ? 'player' : 'npc',
  getModel:       (p: PedHandle): number  => GetEntityModel(p),
  isInVehicle:    (p: PedHandle): boolean => IsPedInAnyVehicle(p, false),
  getVehicle:     (p: PedHandle): VehicleHandle | null => {
    const v = GetVehiclePedIsIn(p, false);
    return DoesEntityExist(v) ? v : null;
  },
  isOnFoot:       (p: PedHandle): boolean => !IsPedInAnyVehicle(p, false),
  isDead:         (p: PedHandle): boolean => IsEntityDead(p),
  isInjured:      (p: PedHandle): boolean => IsPedInjured(p),
  isInCombat:     (p: PedHandle): boolean => IsPedInCombat(p, PlayerPedId()),
  isReloading:    (p: PedHandle): boolean => IsPedReloading(p),
  isFalling:      (p: PedHandle): boolean => IsPedFalling(p),
  isSwimming:     (p: PedHandle): boolean => IsPedSwimming(p),
  isRagdoll:      (p: PedHandle): boolean => IsPedRagdoll(p),

  // ── Health & Armour ───────────────────────────────
  getHealth:    (p: PedHandle): number => GetEntityHealth(p),
  setHealth:    (p: PedHandle, h: number): void => SetEntityHealth(p, h),
  getMaxHealth: (p: PedHandle): number => GetEntityMaxHealth(p),
  setMaxHealth: (p: PedHandle, h: number): void => SetEntityMaxHealth(p, h),
  getArmour:    (p: PedHandle): number => GetPedArmour(p),
  setArmour:    (p: PedHandle, a: number): void => SetPedArmour(p, Math.min(100, Math.max(0, a))),
  addArmour:    (p: PedHandle, a: number): void => SetPedArmour(p, Math.min(100, GetPedArmour(p) + a)),

  // ── Weapons ───────────────────────────────────────
  giveWeapon:      (p: PedHandle, hash: number, ammo: number, equip = false): void =>
    GiveWeaponToPed(p, hash, ammo, false, equip),
  removeWeapon:    (p: PedHandle, hash: number): void => RemoveWeaponFromPed(p, hash),
  removeAllWeapons:(p: PedHandle): void => RemoveAllPedWeapons(p, true),
  hasWeapon:       (p: PedHandle, hash: number): boolean => HasPedGotWeapon(p, hash, false),
  getCurrentWeapon:(p: PedHandle): number => { const [,w] = GetCurrentPedWeapon(p, true); return w; },
  setCurrentWeapon:(p: PedHandle, hash: number): void => SetCurrentPedWeapon(p, hash, true),
  getAmmo:         (p: PedHandle, hash: number): number => GetAmmoInPedWeapon(p, hash),
  setAmmo:         (p: PedHandle, hash: number, a: number): void => SetPedAmmo(p, hash, a),
  addAmmo:         (p: PedHandle, hash: number, a: number): void => AddAmmoToPed(p, hash, a),

  // ── Tasks ─────────────────────────────────────────
  task: {
    walkTo:       (p: PedHandle, c: Vec3, speed = 1.0): void =>
      TaskGoToCoordAnyMeans(p, c.x, c.y, c.z, speed, 0, false, 786603, 0),
    runTo:        (p: PedHandle, c: Vec3): void =>
      TaskGoToCoordAnyMeans(p, c.x, c.y, c.z, 3.0, 0, false, 786603, 0),
    standStill:   (p: PedHandle, ms = -1): void => TaskStandStill(p, ms),
    clearAll:     (p: PedHandle): void => ClearPedTasks(p),
    combatTarget: (p: PedHandle, target: PedHandle): void => TaskCombatPed(p, target, 0, 16),
    fleeFrom:     (p: PedHandle, threat: PedHandle): void =>
      TaskSmartFleePed(p, threat, 200.0, -1, false, false),
    enterVehicle: (p: PedHandle, veh: VehicleHandle, seat = -1): void =>
      TaskEnterVehicle(p, veh, -1, seat, 2.0, 1, 0),
    leaveVehicle: (p: PedHandle): void =>
      TaskLeaveVehicle(p, GetVehiclePedIsIn(p, false), 0),
    playScenario: (p: PedHandle, name: string): void =>
      TaskStartScenarioInPlace(p, name, 0, true),
  },

  // ── Animations ────────────────────────────────────
  playAnim: (p: PedHandle, dict: string, anim: string, blendIn = 8.0, blendOut = -8.0, duration = -1, flag = 0): void => {
    ped.loadAnimDict(dict, () => {
      TaskPlayAnim(p, dict, anim, blendIn, blendOut, duration, flag, 0, false, false, false);
    });
  },
  stopAnim:       (p: PedHandle, dict: string, anim: string): void => StopAnimTask(p, dict, anim, 1.0),
  isPlayingAnim:  (p: PedHandle, dict: string, anim: string): boolean => IsEntityPlayingAnim(p, dict, anim, 3),
  loadAnimDict:   (dict: string, cb: () => void): void => {
    if (HasAnimDictLoaded(dict)) { cb(); return; }
    RequestAnimDict(dict);
    const t = setInterval(() => { if (HasAnimDictLoaded(dict)) { clearInterval(t); cb(); } }, 50);
  },
  isAnimDictLoaded: (dict: string): boolean => HasAnimDictLoaded(dict),

  // ── Appearance ────────────────────────────────────
  setComponent: (p: PedHandle, comp: number, draw: number, tex = 0): void =>
    SetPedComponentVariation(p, comp, draw, tex, 0),
  setProp:      (p: PedHandle, prop: number, draw: number, tex = 0): void =>
    SetPedPropIndex(p, prop, draw, tex, true),
  clearProp:    (p: PedHandle, prop: number): void => ClearPedProp(p, prop),
  clearAllProps:(p: PedHandle): void => ClearAllPedProps(p),
  setFaceFeature:(p: PedHandle, id: number, scale: number): void => SetPedFaceFeature(p, id, scale),
};

log.debug('World API module loaded (entity + vehicle + ped)');
