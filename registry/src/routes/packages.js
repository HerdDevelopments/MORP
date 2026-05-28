'use strict';

const router  = require('express').Router();
const multer  = require('multer');
const semver  = require('semver');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../db/database');
const { saveTarball, readTarball, tarballUrl } = require('../storage/files');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// ─────────────────────────────────────────────────────────────
// SEARCH  GET /packages?q=&tag=&author=&limit=&offset=
// ─────────────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q = '', tag = '', author = '', limit = 20, offset = 0 } = req.query;
    const lim = Math.min(Number(limit) || 20, 100);
    const off = Number(offset) || 0;

    let sql = `
      SELECT p.name, p.description, p.license, p.tags, p.latest, p.downloads,
             p.created_at, p.updated_at, u.username as author
      FROM packages p
      JOIN users u ON p.owner_id = u.id
      WHERE 1=1
    `;
    const args = [];

    if (q) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      args.push(`%${q}%`, `%${q}%`);
    }
    if (tag) {
      sql += ' AND p.tags LIKE ?';
      args.push(`%"${tag}"%`);
    }
    if (author) {
      sql += ' AND u.username = ?';
      args.push(author.toLowerCase());
    }

    sql += ' ORDER BY p.downloads DESC, p.updated_at DESC LIMIT ? OFFSET ?';
    args.push(lim, off);

    const packages = await all(sql, args);

    res.json({
      total:   packages.length,
      limit:   lim,
      offset:  off,
      results: packages.map(formatPackage),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET PACKAGE  GET /packages/:name
// ─────────────────────────────────────────────────────────────
router.get('/:name', optionalAuth, async (req, res) => {
  try {
    const pkg = await get(`
      SELECT p.*, u.username as author, u.public_key as author_pubkey
      FROM packages p JOIN users u ON p.owner_id = u.id
      WHERE p.name = ?
    `, [req.params.name.toLowerCase()]);

    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const versions = await all(
      'SELECT version, protocol, file_size, signed, downloads, root_hash, key_id, published_at FROM versions WHERE package_name = ? ORDER BY published_at DESC',
      [pkg.name]
    );

    res.json({
      ...formatPackage(pkg),
      versions: versions.map(v => ({
        ...v,
        tarball: tarballUrl(pkg.name, v.version),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET VERSION  GET /packages/:name/:version
// ─────────────────────────────────────────────────────────────
router.get('/:name/:version', optionalAuth, async (req, res) => {
  try {
    const pkgName = req.params.name.toLowerCase();
    let   version = req.params.version;

    const pkg = await get('SELECT * FROM packages WHERE name = ?', [pkgName]);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Resolve 'latest'
    if (version === 'latest') version = pkg.latest;

    const ver = await get(
      'SELECT * FROM versions WHERE package_name = ? AND version = ?',
      [pkgName, version]
    );

    if (!ver) return res.status(404).json({ error: `Version ${version} not found` });

    res.json({
      name:        pkgName,
      version:     ver.version,
      protocol:    ver.protocol,
      morp_json:   JSON.parse(ver.morp_json),
      tarball:     tarballUrl(pkgName, version),
      file_size:   ver.file_size,
      root_hash:   ver.root_hash,
      signed:      !!ver.signed,
      key_id:      ver.key_id,
      readme:      ver.readme,
      changelog:   ver.changelog,
      downloads:   ver.downloads,
      published_at:ver.published_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUBLISH  POST /packages/:name/publish
// ─────────────────────────────────────────────────────────────
router.post('/:name/publish', requireAuth, upload.single('tarball'), async (req, res) => {
  try {
    const pkgName = req.params.name.toLowerCase();

    // Validate package name
    if (!/^[a-z0-9\-_]{2,64}$/.test(pkgName))
      return res.status(400).json({ error: 'Package name: 2-64 chars, lowercase letters/numbers/dash/underscore' });

    if (!req.file)
      return res.status(400).json({ error: 'tarball file required (multipart field: tarball)' });

    // Parse metadata from form field
    let meta;
    try {
      meta = JSON.parse(req.body.meta || '{}');
    } catch {
      return res.status(400).json({ error: 'meta field must be valid JSON' });
    }

    const { version, protocol, description, license, tags, readme, changelog, root_hash, signature, key_id } = meta;

    if (!version) return res.status(400).json({ error: 'meta.version required' });
    if (!semver.valid(version)) return res.status(400).json({ error: `Invalid semver version: ${version}` });
    if (!protocol) return res.status(400).json({ error: 'meta.protocol required' });

    // Parse morp.json from meta or require it in the tarball meta
    const morpJson = meta.morp_json || {};

    // Check ownership — if package exists, must be owner
    const existing = await get('SELECT * FROM packages WHERE name = ?', [pkgName]);
    if (existing && existing.owner_id !== req.user.id) {
      return res.status(403).json({ error: `Package "${pkgName}" is owned by another user` });
    }

    // Check version doesn't already exist
    const existingVer = await get(
      'SELECT id FROM versions WHERE package_name = ? AND version = ?',
      [pkgName, version]
    );
    if (existingVer) {
      return res.status(409).json({ error: `Version ${version} already published — versions are immutable` });
    }

    // Save tarball
    const { path: tPath, size } = await saveTarball(pkgName, version, req.file.buffer);

    const now   = new Date().toISOString();
    const verId = uuid();

    // Upsert package
    if (!existing) {
      const pkgId = uuid();
      await run(
        'INSERT INTO packages (id, name, owner_id, description, license, tags, latest, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [pkgId, pkgName, req.user.id, description || '', license || 'MIT', JSON.stringify(tags || []), version, now, now]
      );
    } else {
      // Update latest if new version is greater
      const shouldUpdateLatest = !existing.latest || semver.gt(version, existing.latest);
      await run(
        'UPDATE packages SET description = ?, license = ?, tags = ?, latest = ?, downloads = downloads, updated_at = ? WHERE name = ?',
        [
          description || existing.description,
          license || existing.license,
          JSON.stringify(tags || JSON.parse(existing.tags || '[]')),
          shouldUpdateLatest ? version : existing.latest,
          now,
          pkgName,
        ]
      );
    }

    // Insert version
    await run(
      `INSERT INTO versions
        (id, package_name, version, protocol, tarball, file_size, root_hash, signature, key_id, signed, readme, changelog, morp_json, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        verId, pkgName, version, protocol, tPath, size,
        root_hash  || null,
        signature  || null,
        key_id     || null,
        root_hash && signature ? 1 : 0,
        readme    || null,
        changelog || null,
        JSON.stringify(morpJson),
        now,
      ]
    );

    res.status(201).json({
      message:  `Published ${pkgName}@${version}`,
      name:     pkgName,
      version,
      signed:   !!(root_hash && signature),
      tarball:  tarballUrl(pkgName, version),
      size,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DOWNLOAD  GET /packages/:name/:version/download
// ─────────────────────────────────────────────────────────────
router.get('/:name/:version/download', async (req, res) => {
  try {
    const pkgName = req.params.name.toLowerCase();
    let   version = req.params.version;

    const pkg = await get('SELECT * FROM packages WHERE name = ?', [pkgName]);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    if (version === 'latest') version = pkg.latest;

    const ver = await get(
      'SELECT * FROM versions WHERE package_name = ? AND version = ?',
      [pkgName, version]
    );
    if (!ver) return res.status(404).json({ error: 'Version not found' });

    const tarball = await readTarball(pkgName, version);
    if (!tarball) return res.status(404).json({ error: 'Tarball file not found on server' });

    // Increment download counts
    const dlId = uuid();
    const now  = new Date().toISOString();
    await run('UPDATE packages SET downloads = downloads + 1 WHERE name = ?', [pkgName]);
    await run('UPDATE versions SET downloads = downloads + 1 WHERE package_name = ? AND version = ?', [pkgName, version]);
    await run(
      'INSERT INTO download_log (id, package_name, version, ip, user_agent, downloaded_at) VALUES (?, ?, ?, ?, ?, ?)',
      [dlId, pkgName, version, req.ip, req.headers['user-agent'] || '', now]
    );

    res.set({
      'Content-Type':        'application/gzip',
      'Content-Disposition': `attachment; filename="${pkgName}-${version}.morp.tgz"`,
      'Content-Length':      tarball.length,
      'X-MORP-Root-Hash':    ver.root_hash || '',
      'X-MORP-Signed':       ver.signed ? 'true' : 'false',
    });

    res.send(tarball);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// UNPUBLISH VERSION  DELETE /packages/:name/:version
// ─────────────────────────────────────────────────────────────
router.delete('/:name/:version', requireAuth, async (req, res) => {
  try {
    const pkgName = req.params.name.toLowerCase();
    const version = req.params.version;

    const pkg = await get('SELECT * FROM packages WHERE name = ?', [pkgName]);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    if (pkg.owner_id !== req.user.id) return res.status(403).json({ error: 'Not the package owner' });

    const ver = await get(
      'SELECT * FROM versions WHERE package_name = ? AND version = ?',
      [pkgName, version]
    );
    if (!ver) return res.status(404).json({ error: 'Version not found' });

    await run('DELETE FROM versions WHERE package_name = ? AND version = ?', [pkgName, version]);

    // Update latest pointer if we deleted the latest
    if (pkg.latest === version) {
      const nextLatest = await get(
        'SELECT version FROM versions WHERE package_name = ? ORDER BY published_at DESC LIMIT 1',
        [pkgName]
      );
      await run('UPDATE packages SET latest = ? WHERE name = ?', [nextLatest?.version || null, pkgName]);
    }

    res.json({ message: `Unpublished ${pkgName}@${version}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// TRANSFER  POST /packages/:name/transfer
// ─────────────────────────────────────────────────────────────
router.post('/:name/transfer', requireAuth, async (req, res) => {
  try {
    const pkgName  = req.params.name.toLowerCase();
    const { to_username } = req.body;

    const pkg = await get('SELECT * FROM packages WHERE name = ?', [pkgName]);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    if (pkg.owner_id !== req.user.id) return res.status(403).json({ error: 'Not the package owner' });

    const newOwner = await get('SELECT id FROM users WHERE username = ?', [to_username?.toLowerCase()]);
    if (!newOwner) return res.status(404).json({ error: `User "${to_username}" not found` });

    await run('UPDATE packages SET owner_id = ?, updated_at = ? WHERE name = ?', [
      newOwner.id, new Date().toISOString(), pkgName,
    ]);

    res.json({ message: `Transferred ${pkgName} to ${to_username}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatPackage(p) {
  return {
    name:        p.name,
    description: p.description,
    author:      p.author,
    license:     p.license,
    tags:        tryParseJson(p.tags, []),
    latest:      p.latest,
    downloads:   p.downloads,
    created_at:  p.created_at,
    updated_at:  p.updated_at,
  };
}

function tryParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
