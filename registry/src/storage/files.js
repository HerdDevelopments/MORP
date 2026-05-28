'use strict';
/**
 * MORP Registry — Storage Layer
 * Handles tarball storage on local filesystem.
 * Swap this module for S3/R2 in production.
 */

const fs   = require('fs');
const path = require('path');

const STORAGE_DIR = process.env.MORP_STORAGE_PATH
  || path.join(__dirname, '../../data/tarballs');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function tarballPath(packageName, version) {
  const safe = packageName.replace(/[^a-z0-9\-_]/gi, '_');
  return path.join(STORAGE_DIR, safe, `${safe}-${version}.morp.tgz`);
}

function tarballUrl(packageName, version) {
  const safe = packageName.replace(/[^a-z0-9\-_]/gi, '_');
  return `/packages/${encodeURIComponent(packageName)}/${version}/download`;
}

async function saveTarball(packageName, version, fileBuffer) {
  ensureDir(path.join(STORAGE_DIR, packageName.replace(/[^a-z0-9\-_]/gi, '_')));
  const dest = tarballPath(packageName, version);
  fs.writeFileSync(dest, fileBuffer);
  return { path: dest, size: fileBuffer.length };
}

async function readTarball(packageName, version) {
  const p = tarballPath(packageName, version);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

async function deleteTarball(packageName, version) {
  const p = tarballPath(packageName, version);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { saveTarball, readTarball, deleteTarball, tarballUrl };
