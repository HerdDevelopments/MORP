# MORP Registry

> npm-style resource registry for MORP-compliant FiveM resources

---

## Quick Start

```bash
cd registry
npm install
node src/server.js
# Server on http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MORP_DB_PATH` | `./data/registry.db` | SQLite database path |
| `MORP_STORAGE_PATH` | `./data/tarballs` | Tarball file storage |
| `MORP_JWT_SECRET` | `morp-dev-secret-...` | JWT signing secret — **change in production** |
| `CORS_ORIGIN` | `*` | CORS allowed origin |

## API Reference

### Auth
```
POST /auth/register       { username, email, password }
POST /auth/login          { username, password }
GET  /auth/me             (requires auth)
PUT  /auth/pubkey         { public_key, key_id } — register Ed25519 public key
POST /auth/tokens         { label } — create API token
GET  /auth/tokens         list tokens
DELETE /auth/tokens/:id   revoke token
```

### Packages
```
GET  /packages            search: ?q=&tag=&author=&limit=&offset=
GET  /packages/:name      package info + all versions
GET  /packages/:name/:version         version info
GET  /packages/:name/:version/download  download tarball
POST /packages/:name/publish           (requires auth) publish new version
DELETE /packages/:name/:version        (requires auth, owner only) unpublish
POST /packages/:name/transfer          (requires auth, owner only) transfer ownership
```

### Users / Stats
```
GET /users/:username      public profile + packages
GET /stats                download stats, top packages, recent
GET /health               server health check
```

## CLI Integration

```bash
# Point CLI to your registry
export MORP_REGISTRY=http://localhost:3000

# Login
morp login myusername

# Publish
cd my-resource
morp build
morp sign --key keys/morp_private.pem
morp publish

# Install
morp install morp-economy
morp install morp-jobs@2.1.0

# Search
morp search economy
```

## Production Deployment

1. Set `MORP_JWT_SECRET` to a strong random string
2. Put behind a reverse proxy (nginx/caddy) with TLS
3. Set `CORS_ORIGIN` to your domain
4. Use a persistent volume for `MORP_DB_PATH` and `MORP_STORAGE_PATH`
5. For scale: swap storage layer (`src/storage/files.js`) for S3/R2

### Docker (example)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src ./src
EXPOSE 3000
CMD ["node", "src/server.js"]
```

## Schema

```
users      — accounts, Ed25519 public keys
packages   — package metadata, download counts
versions   — per-version info, tarballs, signatures
api_tokens — auth tokens for CLI
download_log — download history
```
