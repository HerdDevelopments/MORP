# MORP — Modding Open Resource Protocol

## What is MORP?

MORP is a platform-agnostic, open scripting protocol for GTA V multiplayer modding environments.

It sits as an abstraction layer between your scripting resources and the underlying platform (currently FiveM). Resources written against the MORP spec are portable — if another compliant platform ever emerges, your resources migrate with zero rewriting.

MORP is not a FiveM replacement. It is not a fork. It is infrastructure.

---

## Why does this exist?

The GTA V modding ecosystem has a fragility problem. Platforms rise and die — RageMP received a cease & desist, SAMP abandoned, alt:V stagnant. Every time a platform dies, server owners lose years of scripting work overnight because everything was written tightly against that platform's specific API.

MORP is the answer to that problem.

Write once. Run anywhere that speaks MORP.

---

## What does MORP actually provide?

### 1. Protocol Specification
A strict, versioned, RFC-style document defining exactly what a compliant platform must implement. Lifecycle events, player API, event bus, state management, exports, callbacks, entities, vehicles — all standardized.

### 2. Adapter Layer
A drop-in shim (Lua + TypeScript) that maps MORP's clean API surface onto FiveM's native calls today. When a new platform ships a MORP adapter, your resources work there immediately.

### 3. Resource Signing
Every MORP resource can be signed with Ed25519 keypairs. The adapter verifies signatures on load. Prevents tampered or malicious resources from running. Something FiveM has never had.

### 4. CLI Tooling
`morp init`, `morp validate`, `morp build`, `morp sign`, `morp publish`, `morp install` — a full developer workflow from scaffold to deployment.

### 5. Resource Registry
An npm-style public registry for MORP-compliant resources. Install community resources with a single command. Publish your own. The package ecosystem FiveM was always missing.

---

## What makes MORP different from what YAMP announced?

YAMP announced a vision. MORP ships the implementation.

| Feature              | YAMP (announced) | MORP          |
|----------------------|-----------------|---------------|
| Protocol spec        | Vague           | RFC-style, strict |
| Lua adapter          | Mentioned       | Complete      |
| TypeScript adapter   | Mentioned       | Complete + typed |
| Resource signing     | Not mentioned   | Ed25519 built-in |
| CLI tooling          | Not mentioned   | Full pipeline |
| Resource registry    | Not mentioned   | npm-style     |
| Callback system      | Not mentioned   | Built-in      |
| Entity/Vehicle API   | Not mentioned   | Specced + WIP |

---

## Who is this for?

- **Server owners** who are tired of being locked into one platform
- **Resource developers** who want to write portable, secure, publishable scripts
- **Platform builders** who want their new platform to be immediately compatible with the existing MORP ecosystem

---

## Governance

MORP is community-owned. The spec lives in this repository and evolves through public proposals (MRPs — MORP Request for Proposals). No single company controls the protocol.

Breaking changes require a major version bump and a 90-day deprecation notice. Platforms must declare their supported protocol version in `MORP_COMPAT.json`.

---

## Protocol Version

Current: **0.1.0** (Draft)

---

## License

MIT. No rights reserved. Implement freely. Fork freely. Extend freely.

The protocol itself is in the public domain.

---

## Repository

https://github.com/morp-protocol/morp
