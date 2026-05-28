# MORP — Modding Open Resource Protocol

> Write once. Run anywhere. No platform lock-in.

**Protocol:** 0.1.0 (Draft) | **License:** MIT | **Status:** Active Development

---

## Quick Start

```bash
npm install -g morp-cli
morp init my-resource
cd my-resource
morp validate
```

Add to `fxmanifest.lua`:
```lua
shared_script '@morp-core/adapter/lua/morp_adapter.lua'
```

---

## Structure

```
morp/
├── ABOUT.md                        ← Full project overview
├── MORP_COMPAT.json                ← Platform compliance declaration
├── spec/
│   └── PROTOCOL.md                 ← Full protocol specification
├── adapter/
│   ├── lua/
│   │   └── morp_adapter.lua        ← FiveM Lua adapter (complete)
│   └── ts/
│       └── morp_adapter.ts         ← FiveM TypeScript adapter (full types)
├── cli/
│   ├── package.json
│   └── src/
│       └── index.js                ← morp-cli (init/validate/build/sign)
├── examples/
│   └── basic-resource/             ← Working example resource
│       ├── server.lua
│       ├── client.lua
│       └── morp.json
└── docs/
    └── index.html                  ← Documentation landing page
```

---

## API Reference

```lua
-- Events
MORP.on(event, handler)
MORP.off(event, handler)
MORP.emit(event, ...)
MORP.emitServer(event, ...)
MORP.emitClient(player, event, ...)
MORP.emitAllClients(event, ...)
MORP.emitAllClientsExcept(player, event, ...)

-- Players (server)
MORP.player.getName(src)
MORP.player.getId(src)
MORP.player.getPing(src)
MORP.player.getIdentifiers(src)
MORP.player.getAll()
MORP.player.kick(src, reason)
MORP.player.getBucket(src)
MORP.player.setBucket(src, bucket)

-- Players (client)
MORP.player.local_()
MORP.player.getPed()
MORP.player.getCoords()
MORP.player.getHeading()

-- State
MORP.state.set(key, value)
MORP.state.get(key)
MORP.state.delete(key)
MORP.state.player(src).set/get/delete(key, value?)
MORP.state.entity(ent).set/get/delete(key, value?)

-- Exports
MORP.export(name, fn)
MORP.import(resource, name)

-- Callbacks
MORP.callback.register(name, handler)  -- server
MORP.callback.trigger(name, cb, ...)   -- client

-- Scheduler
MORP.every(ms, fn)    → timerId
MORP.after(ms, fn)    → timerId
MORP.nextTick(fn)
MORP.cancel(timerId)

-- Logging
MORP.log.info(msg)
MORP.log.warn(msg)
MORP.log.error(msg)
MORP.log.debug(msg)   -- set MORP_DEBUG=true convar
```

---

## CLI

```bash
morp init <name>      # scaffold a new resource
morp validate [path]  # validate against spec
morp build [path]     # hash all scripts
morp sign [path]      # sign the build
morp info             # help
```

---

## Platform Compliance

Any platform claiming MORP compliance must implement the full spec and ship `MORP_COMPAT.json`. See `/spec/PROTOCOL.md` Section 12.

---

## Contributing

Protocol changes go through MRP (MORP Request for Proposal) — open an issue first. See `ABOUT.md` for governance details.
