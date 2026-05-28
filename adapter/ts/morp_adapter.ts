/**
 * MORP Adapter — FiveM (TypeScript)
 * Protocol:  0.1.0
 * Platform:  FiveM / citizen runtime
 * Full Name: Modding Open Resource Protocol
 */

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type PlayerId = number;
export type EntityHandle = number;
export type TimerId = number;

export interface PlayerIdentifiers {
  steam?:   string;
  license?: string;
  discord?: string;
  ip?:      string;
  xbl?:     string;
  live?:    string;
  fivem?:   string;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export type EventHandler = (...args: any[]) => void;
export type CallbackHandler = (source: PlayerId, cb: (...args: any[]) => void, ...args: any[]) => void;

// ─────────────────────────────────────────
// INTERNALS
// ─────────────────────────────────────────

declare function IsDuplicityVersion(): boolean;
const isServer = typeof IsDuplicityVersion === 'function' && IsDuplicityVersion();

const _timers  = new Map<TimerId, boolean>();
let   _tidx    = 0;
const newTid   = () => ++_tidx;

const lifecycleMap: Record<string, string> = {
  start:            `onResourceStart`,
  stop:             `onResourceStop`,
  playerConnect:    'playerConnecting',
  playerDisconnect: 'playerDropped',
  clientReady:      'onClientResourceStart',
};

// ─────────────────────────────────────────
// EVENT BUS
// ─────────────────────────────────────────

export function on(event: string, handler: EventHandler): void {
  const mapped = lifecycleMap[event];
  on(mapped ?? `morp:${event}`, handler);
}

export function off(event: string, handler: EventHandler): void {
  RemoveEventHandler(`morp:${event}`, handler);
}

export function emit(event: string, ...args: any[]): void {
  emit(`morp:${event}`, ...args);
}

export function emitServer(event: string, ...args: any[]): void {
  if (isServer) {
    emit(`morp:${event}`, ...args);
  } else {
    emitNet(`morp:${event}`, ...args);
  }
}

export function emitClient(player: PlayerId, event: string, ...args: any[]): void {
  if (!isServer) { console.warn('[MORP] emitClient is server-only'); return; }
  emitNet(`morp:${event}`, player, ...args);
}

export function emitAllClients(event: string, ...args: any[]): void {
  if (isServer) emitNet(`morp:${event}`, -1, ...args);
}

export function emitAllClientsExcept(player: PlayerId, event: string, ...args: any[]): void {
  if (!isServer) return;
  getPlayers().forEach(src => {
    if (Number(src) !== player) emitNet(`morp:${event}`, Number(src), ...args);
  });
}

// ─────────────────────────────────────────
// PLAYER API
// ─────────────────────────────────────────

export const player = isServer
  ? {
      getName: (src: PlayerId): string =>
        GetPlayerName(src) ?? 'Unknown',

      getId: (src: PlayerId): number =>
        Number(src),

      getPing: (src: PlayerId): number =>
        GetPlayerPing(src),

      kick: (src: PlayerId, reason = 'Kicked'): void =>
        DropPlayer(src, reason),

      getAll: (): PlayerId[] =>
        getPlayers().map(Number),

      getIdentifiers: (src: PlayerId): PlayerIdentifiers => {
        const ids: PlayerIdentifiers = {};
        const count = GetNumPlayerIdentifiers(src);
        for (let i = 0; i < count; i++) {
          const id = GetPlayerIdentifier(src, i);
          if (id) {
            const [prefix] = id.split(':');
            (ids as any)[prefix] = id;
          }
        }
        return ids;
      },

      getBucket: (src: PlayerId): number =>
        GetPlayerRoutingBucket(src),

      setBucket: (src: PlayerId, bucket: number): void =>
        SetPlayerRoutingBucket(src, bucket),
    }
  : {
      local: (): PlayerId   => PlayerId(),
      getPed: (): EntityHandle => PlayerPedId(),
      getCoords: (): Vector3 => {
        const [x, y, z] = GetEntityCoords(PlayerPedId(), true);
        return { x, y, z };
      },
      getHeading: (): number => GetEntityHeading(PlayerPedId()),
    };

// ─────────────────────────────────────────
// STATE / KV
// ─────────────────────────────────────────

export const state = {
  set: (key: string, value: any): void => {
    if (!isServer) { console.warn('[MORP] state.set is server-only'); return; }
    GlobalState[key] = value;
  },
  get: <T = any>(key: string): T => GlobalState[key],
  delete: (key: string): void => {
    if (isServer) GlobalState[key] = null;
  },

  player: (src: PlayerId) => ({
    set:    (key: string, value: any) => { Player(src).state[key] = value; },
    get:    <T = any>(key: string): T => Player(src).state[key],
    delete: (key: string)             => { Player(src).state[key] = null; },
  }),

  entity: (ent: EntityHandle) => ({
    set:    (key: string, value: any) => { Entity(ent).state[key] = value; },
    get:    <T = any>(key: string): T => Entity(ent).state[key],
    delete: (key: string)             => { Entity(ent).state[key] = null; },
  }),
};

// ─────────────────────────────────────────
// EXPORTS / IMPORTS
// ─────────────────────────────────────────

export const exportFn = (name: string, fn: (...args: any[]) => any): void => {
  exports(name, fn);
};

export const importFn = (resource: string, name: string) =>
  (...args: any[]) => exports[resource][name](...args);

// ─────────────────────────────────────────
// CALLBACKS
// ─────────────────────────────────────────

const _pending = new Map<string, (...args: any[]) => void>();

export const callback = isServer
  ? {
      register: (name: string, handler: CallbackHandler): void => {
        on(`morp:cb:req:${name}`, (cbId: string, ...args: any[]) => {
          const src = (global as any).source;
          handler(src, (...res: any[]) => {
            emitNet(`morp:cb:res:${name}`, src, cbId, ...res);
          }, ...args);
        });
      },
    }
  : {
      trigger: (name: string, cb: (...args: any[]) => void, ...args: any[]): void => {
        const cbId = `${Math.random().toString(36).slice(2)}_${Date.now()}`;
        _pending.set(cbId, cb);

        on(`morp:cb:res:${name}`, (resId: string, ...res: any[]) => {
          if (resId === cbId) {
            _pending.get(resId)?.(...res);
            _pending.delete(resId);
          }
        });

        emitNet(`morp:cb:req:${name}`, cbId, ...args);
      },
    };

// ─────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────

export function every(ms: number, fn: () => void): TimerId {
  const id = newTid();
  _timers.set(id, true);
  const loop = () => {
    setTimeout(() => {
      if (_timers.get(id)) { fn(); loop(); }
    }, ms);
  };
  loop();
  return id;
}

export function after(ms: number, fn: () => void): TimerId {
  const id = newTid();
  _timers.set(id, true);
  setTimeout(() => {
    if (_timers.get(id)) { fn(); _timers.delete(id); }
  }, ms);
  return id;
}

export function nextTick(fn: () => void): void {
  setTimeout(fn, 0);
}

export function cancel(id: TimerId): void {
  _timers.delete(id);
}

// ─────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────

const debugEnabled = GetConvar?.('MORP_DEBUG', 'false') === 'true';

export const log = {
  info:  (msg: string) => console.log(`^2[MORP]^7 ${msg}`),
  warn:  (msg: string) => console.log(`^3[MORP WARN]^7 ${msg}`),
  error: (msg: string) => console.log(`^1[MORP ERROR]^7 ${msg}`),
  debug: (msg: string) => { if (debugEnabled) console.log(`^5[MORP DEBUG]^7 ${msg}`); },
};

// ─────────────────────────────────────────
// DEFAULT EXPORT
// ─────────────────────────────────────────

export default {
  on, off, emit, emitServer, emitClient, emitAllClients, emitAllClientsExcept,
  player, state, callback,
  export: exportFn,
  import: importFn,
  every, after, nextTick, cancel,
  log,
};

log.info(`Adapter loaded — FiveM/TS — Protocol 0.1.0`);
