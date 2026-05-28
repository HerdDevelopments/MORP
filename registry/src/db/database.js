'use strict';
/**
 * MORP Registry — Database Layer
 * Engine: libSQL (SQLite-compatible)
 */

const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = process.env.MORP_DB_PATH || path.join(__dirname, '../../data/registry.db');

let _db = null;

function db() {
  if (!_db) {
    _db = createClient({ url: `file:${DB_PATH}` });
  }
  return _db;
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

async function migrate() {
  const d = db();

  await d.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      public_key  TEXT,
      key_id      TEXT,
      verified    INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS packages (
      id           TEXT PRIMARY KEY,
      name         TEXT UNIQUE NOT NULL,
      owner_id     TEXT NOT NULL,
      description  TEXT,
      license      TEXT DEFAULT 'MIT',
      tags         TEXT DEFAULT '[]',
      latest       TEXT,
      downloads    INTEGER DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS versions (
      id           TEXT PRIMARY KEY,
      package_name TEXT NOT NULL,
      version      TEXT NOT NULL,
      protocol     TEXT NOT NULL,
      tarball      TEXT NOT NULL,
      file_size    INTEGER DEFAULT 0,
      root_hash    TEXT,
      signature    TEXT,
      key_id       TEXT,
      signed       INTEGER DEFAULT 0,
      downloads    INTEGER DEFAULT 0,
      readme       TEXT,
      changelog    TEXT,
      morp_json    TEXT NOT NULL,
      published_at TEXT NOT NULL,
      UNIQUE (package_name, version),
      FOREIGN KEY (package_name) REFERENCES packages(name)
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token       TEXT UNIQUE NOT NULL,
      label       TEXT,
      last_used   TEXT,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS download_log (
      id           TEXT PRIMARY KEY,
      package_name TEXT NOT NULL,
      version      TEXT NOT NULL,
      ip           TEXT,
      user_agent   TEXT,
      downloaded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_versions_package ON versions(package_name);
    CREATE INDEX IF NOT EXISTS idx_packages_owner   ON packages(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_user      ON api_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_token     ON api_tokens(token);
  `);

  console.log('[DB] Schema migrated');
}

// ─────────────────────────────────────────────────────────────
// QUERY HELPERS
// ─────────────────────────────────────────────────────────────

async function run(sql, args = []) {
  return db().execute({ sql, args });
}

async function get(sql, args = []) {
  const r = await db().execute({ sql, args });
  return r.rows[0] ?? null;
}

async function all(sql, args = []) {
  const r = await db().execute({ sql, args });
  return r.rows;
}

module.exports = { db, migrate, run, get, all };
