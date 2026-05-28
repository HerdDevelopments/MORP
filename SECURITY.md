# MORP Security Model

## Signing Algorithm

**Ed25519** (RFC 8032) — elliptic curve digital signature algorithm.

- 256-bit keys
- Fast verification
- Small signature size (64 bytes)
- No padding oracle or timing attacks
- Used in SSH, TLS 1.3, Signal, Wireguard

## Key Management

### Private Key (`morp_private.pem`)
- PKCS#8 format, PEM encoded
- **Never commit to version control**
- Store securely — loss means you cannot update signed resources
- One keypair per developer/publisher recommended

### Public Key (`morp_public.pem`)
- SPKI format, PEM encoded
- Distribute to server operators and players
- Server operators register it as `MORP_PUBLIC_KEY` convar
- Can be published on GitHub, your website, Discord

### Key ID
- First 16 hex chars of SHA-256(publicKey)
- Used to identify which key signed a resource
- Stored in `morp.sig` for key lookup

## Bundle Hash Construction

The root hash is designed to be:
1. **Deterministic** — same files always produce same hash
2. **Tamper-evident** — any file change changes the hash
3. **Stable across signing** — `morp.json` signature field is normalized to `""` before hashing, preventing circular dependency

```
rootHash = SHA-256(
  sorted entries of "path:SHA-256(fileContent)\n"
)
```

## Threat Model

| Threat | Protection |
|--------|-----------|
| Malicious resource injection | Ed25519 signature verification |
| File modification after signing | Root hash mismatch detection |
| Signature forgery | Ed25519 — computationally infeasible without private key |
| Key compromise | Rotate keys — re-sign all resources with new keypair |
| Replay attacks | `signedAt` timestamp in sig file |
| Wrong resource loaded | `resource` name embedded in sig file |

## What signing does NOT protect against

- Resources that were malicious before signing
- Compromised build machines
- Social engineering (distributing the wrong public key)
- Protocol vulnerabilities in FiveM itself

## Rotating Keys

If your private key is compromised:
1. Generate a new keypair: `morp keygen`
2. Re-sign all your resources: `morp build && morp sign --key new_private.pem`
3. Publish the new public key
4. Notify server operators to update their `MORP_PUBLIC_KEY` convar
5. Consider publishing a key revocation notice in your GitHub repo

## Convar Setup (Server Operators)

```
# server.cfg
set MORP_PUBLIC_KEY "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
set MORP_AUTO_VERIFY "true"
set MORP_DEBUG "false"
```
