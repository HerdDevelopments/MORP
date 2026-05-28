#!/usr/bin/env node
/**
 * morp-cli — Modding Open Resource Protocol Developer Tools
 * Protocol: 0.2.0
 * Commands: init, validate, build, keygen, sign, verify, info
 */

import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, chmodSync,
} from 'fs';
import { resolve, join } from 'path';
import {
  generateKeyPairSync, sign as ed25519Sign,
  verify as ed25519Verify, createHash,
} from 'crypto';

const VERSION  = '0.2.0';
const PROTOCOL = '0.2';
const REGISTRY = process.env.MORP_REGISTRY || 'http://localhost:3000';

// ─────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

const c   = (col, txt) => `${C[col]}${txt}${C.reset}`;
const ok  = msg => console.log(`  ${c('green',   '✓')} ${msg}`);
const err = msg => console.log(`  ${c('red',     '✗')} ${msg}`);
const inf = msg => console.log(`  ${c('cyan',    '◆')} ${msg}`);
const wrn = msg => console.log(`  ${c('yellow',  '⚠')} ${msg}`);
const sec = msg => console.log(`  ${c('magenta', '⬡')} ${msg}`);
const br  = ()  => console.log('');

// ─────────────────────────────────────────
// SIGNING CORE (Ed25519)
// ─────────────────────────────────────────

function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const keyId = createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
  return { publicKey, privateKey, keyId, createdAt: new Date().toISOString() };
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function buildBundleManifest(resourceDir, manifest) {
  const scriptFiles = [
    ...(manifest.scripts?.server ?? []),
    ...(manifest.scripts?.client ?? []),
    ...(manifest.scripts?.shared ?? []),
  ];

  const allFiles = [...new Set([...scriptFiles, 'morp.json'])];

  const entries = allFiles.map(f => {
    const abs = join(resourceDir, f);
    if (!existsSync(abs)) throw new Error(`File not found: ${f}`);

    let content = readFileSync(abs);

    // Normalize morp.json: zero out the signature field before hashing
    // so the hash is stable regardless of whether it's been signed before
    if (f === 'morp.json') {
      try {
        const parsed = JSON.parse(content.toString('utf8'));
        parsed.signature = '';
        content = Buffer.from(JSON.stringify(parsed, null, 2));
      } catch {}
    }

    return {
      path: f,
      hash: createHash('sha256').update(content).digest('hex'),
      size: content.length,
    };
  }).sort((a, b) => a.path.localeCompare(b.path));

  const rootHashInput = entries.map(e => `${e.path}:${e.hash}`).join('\n');
  const rootHash = createHash('sha256').update(rootHashInput).digest('hex');

  return {
    name:     manifest.name,
    version:  manifest.version,
    protocol: manifest.protocol,
    files:    entries,
    rootHash,
    builtAt:  new Date().toISOString(),
  };
}

function signBundle(bundle, privateKeyPem) {
  const dataToSign = Buffer.from(bundle.rootHash, 'utf8');
  const sigBuffer  = ed25519Sign(null, dataToSign, privateKeyPem);

  // Derive stable keyId from private key hash (public key extraction requires KeyObject)
  const keyId = createHash('sha256').update(privateKeyPem).digest('hex').slice(0, 16);

  return {
    algorithm: 'Ed25519',
    keyId,
    resource:  bundle.name,
    version:   bundle.version,
    protocol:  bundle.protocol,
    rootHash:  bundle.rootHash,
    signature: sigBuffer.toString('hex'),
    signedAt:  new Date().toISOString(),
  };
}

function verifyBundle(resourceDir, sigFile, publicKeyPem) {
  // 1. Recompute bundle from disk
  let currentBundle;
  try {
    const morpJson = JSON.parse(readFileSync(join(resourceDir, 'morp.json'), 'utf8'));
    currentBundle  = buildBundleManifest(resourceDir, morpJson);
  } catch (e) {
    return { valid: false, reason: `Bundle hash failed: ${e.message}` };
  }

  // 2. Compare root hashes — detects any file modification
  if (currentBundle.rootHash !== sigFile.rootHash) {
    return {
      valid:  false,
      reason: `Root hash mismatch — files have changed since signing.\n` +
              `    Expected: ${sigFile.rootHash.slice(0,32)}...\n` +
              `    Got:      ${currentBundle.rootHash.slice(0,32)}...`,
    };
  }

  // 3. Verify Ed25519 signature
  try {
    const dataToVerify = Buffer.from(sigFile.rootHash, 'utf8');
    const sigBuffer    = Buffer.from(sigFile.signature, 'hex');
    const isValid      = ed25519Verify(null, dataToVerify, publicKeyPem, sigBuffer);

    if (!isValid) return { valid: false, reason: 'Signature invalid — key mismatch or corruption' };
  } catch (e) {
    return { valid: false, reason: `Verification error: ${e.message}` };
  }

  return { valid: true, keyId: sigFile.keyId, signedAt: sigFile.signedAt };
}

// ─────────────────────────────────────────
// COMMAND: init
// ─────────────────────────────────────────

function cmdInit([name]) {
  if (!name) { err('Usage: morp init <resource-name>'); process.exit(1); }

  const dir = resolve(name);
  if (existsSync(dir)) { err(`Directory "${name}" already exists`); process.exit(1); }

  mkdirSync(dir);

  writeFileSync(join(dir, 'morp.json'), JSON.stringify({
    name,
    version:      '1.0.0',
    protocol:     PROTOCOL,
    author:       '',
    description:  '',
    license:      'MIT',
    exports:      [],
    dependencies: ['morp-core'],
    scripts:      { server: ['server.lua'], client: ['client.lua'], shared: [] },
    signature:    '',
  }, null, 2));

  writeFileSync(join(dir, 'fxmanifest.lua'),
`fx_version 'cerulean'\ngame 'gta5'\n\n-- MORP Protocol ${PROTOCOL}\nshared_script '@morp-core/adapter/lua/morp_adapter.lua'\n\nserver_script 'server.lua'\nclient_script 'client.lua'\n`);

  writeFileSync(join(dir, 'server.lua'),
`-- ${name} — server.lua\n-- MORP Protocol ${PROTOCOL}\n\nMORP.on('playerConnect', function()\n  MORP.log.info('Player connected: ' .. MORP.player.getName(source))\nend)\n`);

  writeFileSync(join(dir, 'client.lua'),
`-- ${name} — client.lua\n-- MORP Protocol ${PROTOCOL}\n\nMORP.on('clientReady', function()\n  MORP.log.info('${name} — client ready')\nend)\n`);

  br();
  ok(`Created: ${c('bold', name)}`);
  inf('morp.json  fxmanifest.lua  server.lua  client.lua');
  br();
  inf(`Next: ${c('dim', `cd ${name} && morp validate`)}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: validate
// ─────────────────────────────────────────

function cmdValidate([dir = '.']) {
  const root = resolve(dir);
  const manifestPath = join(root, 'morp.json');

  if (!existsSync(manifestPath)) { err('No morp.json found'); process.exit(1); }

  let m;
  try { m = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch (e) { err('morp.json parse error: ' + e.message); process.exit(1); }

  br();
  console.log(`${c('bold', `  Validating: ${m.name || 'unknown'}`)}`);
  br();

  let pass = true;
  for (const f of ['name', 'version', 'protocol', 'scripts']) {
    if (!m[f]) { err(`Missing required field: "${f}"`); pass = false; }
    else ok(`${f}: ${JSON.stringify(m[f])}`);
  }

  if (m.protocol && m.protocol !== PROTOCOL)
    wrn(`Protocol "${m.protocol}" — CLI supports "${PROTOCOL}"`);

  const scripts = [
    ...(m.scripts?.server ?? []),
    ...(m.scripts?.client ?? []),
    ...(m.scripts?.shared ?? []),
  ];

  for (const f of scripts) {
    if (!existsSync(join(root, f))) wrn(`Script not found: ${f}`);
    else ok(`Script: ${f}`);
  }

  const sigPath = join(root, 'morp.sig');
  if (existsSync(sigPath)) {
    try {
      const sig = JSON.parse(readFileSync(sigPath, 'utf8'));
      if (sig.algorithm === 'Ed25519') {
        sec(`Signed — algorithm: Ed25519 | keyId: ${sig.keyId} | signed: ${sig.signedAt}`);
      } else {
        wrn(`Signature present but algorithm unknown: ${sig.algorithm}`);
      }
    } catch {
      wrn('morp.sig exists but could not be parsed');
    }
  } else {
    wrn('Unsigned — no morp.sig (run: morp sign)');
  }

  br();
  if (pass) ok(c('green', 'MORP-compliant ✓'));
  else { err('Validation failed'); process.exit(1); }
  br();
}

// ─────────────────────────────────────────
// COMMAND: build
// ─────────────────────────────────────────

function cmdBuild([dir = '.']) {
  const root = resolve(dir);
  let m;
  try { m = JSON.parse(readFileSync(join(root, 'morp.json'), 'utf8')); }
  catch (e) { err('Could not read morp.json: ' + e.message); process.exit(1); }

  br();
  inf(`Building: ${c('bold', m.name)} v${m.version}`);
  br();

  let bundle;
  try {
    bundle = buildBundleManifest(root, m);
  } catch (e) {
    err(`Build failed: ${e.message}`);
    process.exit(1);
  }

  for (const f of bundle.files) {
    ok(`${f.path} — ${f.hash.slice(0, 16)}... (${f.size}b)`);
  }

  writeFileSync(join(root, '.morp-build'), JSON.stringify(bundle, null, 2));

  br();
  ok(`Root hash: ${c('cyan', bundle.rootHash.slice(0, 32))}...`);
  ok(`Build manifest: .morp-build`);
  inf(`Next: ${c('dim', 'morp sign --key path/to/private.pem')}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: keygen
// ─────────────────────────────────────────

function cmdKeygen(args) {
  const outDir = args[0] ? resolve(args[0]) : process.cwd();
  const privPath = join(outDir, 'morp_private.pem');
  const pubPath  = join(outDir, 'morp_public.pem');
  const metaPath = join(outDir, 'morp_key.json');

  if (existsSync(privPath)) {
    err(`Key already exists at ${privPath}`);
    err('Delete it manually or use a different output directory');
    process.exit(1);
  }

  br();
  inf('Generating Ed25519 keypair...');
  br();

  const kp = generateKeyPair();

  writeFileSync(privPath, kp.privateKey, { mode: 0o600 });
  writeFileSync(pubPath,  kp.publicKey);
  writeFileSync(metaPath, JSON.stringify({
    keyId:     kp.keyId,
    algorithm: 'Ed25519',
    createdAt: kp.createdAt,
    publicKeyFile:  'morp_public.pem',
    privateKeyFile: 'morp_private.pem',
  }, null, 2));

  sec(`Key ID:      ${c('bold', kp.keyId)}`);
  ok(`Private key: ${privPath}`);
  ok(`Public key:  ${pubPath}`);
  ok(`Key meta:    ${metaPath}`);
  br();
  console.log(`  ${c('yellow', '⚠  SECURITY NOTICE')}`);
  console.log(`  ${c('dim', 'morp_private.pem — keep secret, never commit to git')}`);
  console.log(`  ${c('dim', 'morp_public.pem  — distribute to players/servers for verification')}`);
  br();
  inf(`Share your public key: ${c('dim', 'morp_public.pem')}`);
  inf(`Sign resources with:   ${c('dim', `morp sign --key ${privPath}`)}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: sign
// ─────────────────────────────────────────

function cmdSign(args) {
  // Parse --key flag
  const keyFlagIdx = args.indexOf('--key');
  const keyPath    = keyFlagIdx !== -1 ? resolve(args[keyFlagIdx + 1]) : null;
  const dirArg     = args.find(a => !a.startsWith('--') && a !== args[keyFlagIdx + 1]);
  const root       = resolve(dirArg ?? '.');

  if (!keyPath) {
    err('Missing --key flag');
    inf('Usage: morp sign --key path/to/morp_private.pem [resource-dir]');
    process.exit(1);
  }

  if (!existsSync(keyPath)) {
    err(`Private key not found: ${keyPath}`);
    inf('Generate one with: morp keygen');
    process.exit(1);
  }

  const buildPath = join(root, '.morp-build');
  if (!existsSync(buildPath)) {
    err('No .morp-build found — run morp build first');
    process.exit(1);
  }

  let bundle;
  try { bundle = JSON.parse(readFileSync(buildPath, 'utf8')); }
  catch (e) { err('Could not read .morp-build: ' + e.message); process.exit(1); }

  let privateKeyPem;
  try { privateKeyPem = readFileSync(keyPath, 'utf8'); }
  catch (e) { err('Could not read private key: ' + e.message); process.exit(1); }

  br();
  inf(`Signing: ${c('bold', bundle.name)} v${bundle.version}`);
  br();

  let sigFile;
  try {
    sigFile = signBundle(bundle, privateKeyPem);
  } catch (e) {
    err(`Signing failed: ${e.message}`);
    process.exit(1);
  }

  writeFileSync(join(root, 'morp.sig'), JSON.stringify(sigFile, null, 2));

  sec(`Algorithm:  Ed25519`);
  sec(`Key ID:     ${sigFile.keyId}`);
  sec(`Root hash:  ${sigFile.rootHash.slice(0, 32)}...`);
  sec(`Signature:  ${sigFile.signature.slice(0, 32)}...`);
  ok(`Signed at:  ${sigFile.signedAt}`);
  ok(`Output:     morp.sig`);
  br();
  inf(`Distribute morp.sig alongside your resource`);
  inf(`Servers verify with: ${c('dim', 'morp verify --key morp_public.pem')}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: verify
// ─────────────────────────────────────────

function cmdVerify(args) {
  const keyFlagIdx = args.indexOf('--key');
  const keyPath    = keyFlagIdx !== -1 ? resolve(args[keyFlagIdx + 1]) : null;
  const dirArg     = args.find(a => !a.startsWith('--') && a !== args[keyFlagIdx + 1]);
  const root       = resolve(dirArg ?? '.');

  if (!keyPath) {
    err('Missing --key flag');
    inf('Usage: morp verify --key path/to/morp_public.pem [resource-dir]');
    process.exit(1);
  }

  if (!existsSync(keyPath)) {
    err(`Public key not found: ${keyPath}`);
    process.exit(1);
  }

  const sigPath = join(root, 'morp.sig');
  if (!existsSync(sigPath)) {
    err('No morp.sig found — resource is unsigned');
    process.exit(1);
  }

  let sigFile;
  try { sigFile = JSON.parse(readFileSync(sigPath, 'utf8')); }
  catch (e) { err('Could not parse morp.sig: ' + e.message); process.exit(1); }

  let publicKeyPem;
  try { publicKeyPem = readFileSync(keyPath, 'utf8'); }
  catch (e) { err('Could not read public key: ' + e.message); process.exit(1); }

  br();
  inf(`Verifying: ${c('bold', sigFile.resource)} v${sigFile.version}`);
  br();

  const result = verifyBundle(root, sigFile, publicKeyPem);

  if (result.valid) {
    sec(`Algorithm: Ed25519`);
    sec(`Key ID:    ${result.keyId}`);
    sec(`Signed:    ${result.signedAt}`);
    br();
    ok(c('green', 'Signature VALID ✓ — resource is authentic and untampered'));
    br();
  } else {
    err(c('red', 'Signature INVALID ✗'));
    err(result.reason);
    br();
    process.exit(1);
  }
}

// ─────────────────────────────────────────
// COMMAND: info
// ─────────────────────────────────────────

function cmdInfo() {
  console.log(`
${c('bold', '  MORP CLI')} ${c('dim', `v${VERSION}`)}
${c('cyan', '  Modding Open Resource Protocol — Developer Tools')}

${c('bold', '  Resource commands:')}
  ${c('green', 'init')} <name>                 Scaffold a new resource
  ${c('green', 'validate')} [path]             Validate against MORP spec
  ${c('green', 'build')} [path]                Hash all files for signing
  ${c('green', 'dev')} [path] [--port=7700]    Hot reload watcher

${c('bold', '  Signing commands:')}
  ${c('green', 'keygen')} [outDir]             Generate Ed25519 keypair
  ${c('green', 'sign')} --key <pem> [path]     Sign a built resource
  ${c('green', 'verify')} --key <pem> [path]   Verify a signed resource

${c('bold', '  Registry commands:')}
  ${c('green', 'login')} <username>            Log in to registry
  ${c('green', 'whoami')}                      Show current user
  ${c('green', 'publish')} [path]              Publish resource to registry
  ${c('green', 'install')} <pkg>[@version]     Install from registry
  ${c('green', 'search')} <query>              Search registry

${c('bold', '  Signing workflow:')}
  ${c('dim', '1.')} morp keygen
  ${c('dim', '2.')} morp build
  ${c('dim', '3.')} morp sign --key morp_private.pem
  ${c('dim', '4.')} morp verify --key morp_public.pem

${c('bold', '  Protocol:')} ${PROTOCOL}
${c('bold', '  Signing:')}   Ed25519 (RFC 8032)
${c('bold', '  Registry:')}  ${REGISTRY}
${c('bold', '  Docs:')}     https://github.com/morp-protocol/morp
`);
}

// ─────────────────────────────────────────
// ENTRY
// ─────────────────────────────────────────

const [,, cmd, ...args] = process.argv;
const commands = {
  init:     cmdInit,
  validate: cmdValidate,
  build:    cmdBuild,
  keygen:   cmdKeygen,
  sign:     cmdSign,
  verify:   cmdVerify,
  info:     cmdInfo,
};


// ─────────────────────────────────────────
// REGISTRY HELPERS
// ─────────────────────────────────────────


async function registryFetch(path, opts = {}) {
  const { default: fetch } = await import('node-fetch');
  const url = `${REGISTRY}${path}`;
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({ error: 'Invalid response' }));
  return { status: res.status, ok: res.ok, data: json };
}

function loadToken() {
  const tokenPath = join(process.env.HOME || process.env.USERPROFILE || '.', '.morp-token');
  if (existsSync(tokenPath)) return readFileSync(tokenPath, 'utf8').trim();
  return null;
}

function saveToken(token) {
  const tokenPath = join(process.env.HOME || process.env.USERPROFILE || '.', '.morp-token');
  writeFileSync(tokenPath, token, { mode: 0o600 });
}

// ─────────────────────────────────────────
// COMMAND: login
// ─────────────────────────────────────────

async function cmdLogin([username]) {
  if (!username) { err('Usage: morp login <username>'); process.exit(1); }

  // Simple password prompt via stdin
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question(`  Password for ${c('cyan', username)}: `, async (password) => {
    rl.close();
    br();

    const { ok: reqOk, data, status } = await registryFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!reqOk) { err(`Login failed: ${data.error}`); process.exit(1); }

    saveToken(data.token);
    ok(`Logged in as ${c('bold', data.user.username)}`);
    inf(`Token saved to ~/.morp-token`);
    br();
  });
}

// ─────────────────────────────────────────
// COMMAND: whoami
// ─────────────────────────────────────────

async function cmdWhoami() {
  const token = loadToken();
  if (!token) { err('Not logged in — run: morp login <username>'); process.exit(1); }

  const { ok: reqOk, data } = await registryFetch('/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!reqOk) { err(`Auth failed: ${data.error}`); process.exit(1); }

  br();
  ok(`Logged in as: ${c('bold', data.username)}`);
  inf(`Email:        ${data.email}`);
  if (data.key_id) sec(`Key ID:       ${data.key_id}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: publish
// ─────────────────────────────────────────

async function cmdPublish(args) {
  const dir   = args[0] ? resolve(args[0]) : process.cwd();
  const token = loadToken();

  if (!token) {
    err('Not logged in — run: morp login <username>');
    process.exit(1);
  }

  // Read morp.json
  let morpJson;
  try { morpJson = JSON.parse(readFileSync(join(dir, 'morp.json'), 'utf8')); }
  catch { err('No morp.json found'); process.exit(1); }

  // Read build manifest
  let buildManifest;
  try { buildManifest = JSON.parse(readFileSync(join(dir, '.morp-build'), 'utf8')); }
  catch { err('No .morp-build found — run morp build first'); process.exit(1); }

  // Read signature if present
  let sigFile = null;
  const sigPath = join(dir, 'morp.sig');
  if (existsSync(sigPath)) {
    try { sigFile = JSON.parse(readFileSync(sigPath, 'utf8')); }
    catch { wrn('Could not parse morp.sig — publishing unsigned'); }
  }

  br();
  inf(`Publishing: ${c('bold', morpJson.name)}@${morpJson.version}`);
  if (sigFile) sec(`Signed — algorithm: ${sigFile.algorithm} | keyId: ${sigFile.keyId}`);
  else wrn('Unsigned — consider signing with: morp sign --key morp_private.pem');
  br();

  // Create tarball (simple tar.gz of the resource directory)
  const { default: fetch } = await import('node-fetch');
  const FormData = (await import('form-data')).default;

  // Bundle all files into a buffer (simplified tarball — zip in practice)
  const files = [
    ...(morpJson.scripts?.server || []),
    ...(morpJson.scripts?.client || []),
    ...(morpJson.scripts?.shared || []),
    'morp.json',
  ];

  if (existsSync(sigPath)) files.push('morp.sig');

  // Create a simple concatenated bundle (real impl: use tar-stream or archiver)
  const { createHash: ch2 } = await import('crypto');
  const bundleHash = ch2('sha256');
  const parts = [];
  for (const f of [...new Set(files)]) {
    const fp = join(dir, f);
    if (!existsSync(fp)) { wrn(`Skipping missing file: ${f}`); continue; }
    const content = readFileSync(fp);
    bundleHash.update(content);
    parts.push({ name: f, content });
    ok(`Packed: ${f} (${content.length}b)`);
  }

  // Encode as JSON bundle (simple format — swap for proper tgz in production)
  const bundle = Buffer.from(JSON.stringify({
    format:  'morp-bundle-v1',
    files:   parts.map(p => ({ name: p.name, content: p.content.toString('base64') })),
  }));

  const form = new FormData();
  form.append('tarball', bundle, {
    filename:    `${morpJson.name}-${morpJson.version}.morp.tgz`,
    contentType: 'application/gzip',
  });
  form.append('meta', JSON.stringify({
    version:     morpJson.version,
    protocol:    morpJson.protocol,
    description: morpJson.description || '',
    license:     morpJson.license || 'MIT',
    tags:        morpJson.tags || [],
    readme:      existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : '',
    root_hash:   buildManifest.rootHash,
    signature:   sigFile?.signature || null,
    key_id:      sigFile?.keyId     || null,
    morp_json:   morpJson,
  }));

  br();
  inf('Uploading to registry...');

  const res = await fetch(`${REGISTRY}/packages/${morpJson.name}/publish`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, ...form.getHeaders() },
    body:    form,
  });

  const data = await res.json().catch(() => ({ error: 'Invalid response' }));

  if (!res.ok) {
    err(`Publish failed: ${data.error}`);
    process.exit(1);
  }

  br();
  ok(`Published: ${c('bold', data.name)}@${data.version}`);
  if (data.signed) sec('Signed package ✓');
  inf(`Install with: ${c('dim', `morp install ${morpJson.name}`)}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: install
// ─────────────────────────────────────────

async function cmdInstall(args) {
  if (!args[0]) { err('Usage: morp install <package>[@version]'); process.exit(1); }

  const [pkgName, pkgVersion] = args[0].split('@');
  const version = pkgVersion || 'latest';
  const outDir  = args[1] ? resolve(args[1]) : process.cwd();

  br();
  inf(`Installing: ${c('bold', pkgName)}@${version}`);
  br();

  // Fetch version metadata
  const { ok: reqOk, data } = await registryFetch(`/packages/${pkgName}/${version}`);
  if (!reqOk) { err(`Package not found: ${pkgName}@${version}`); process.exit(1); }

  ok(`Found: ${pkgName}@${data.version}`);
  if (data.signed) sec(`Signed — keyId: ${data.key_id}`);
  else wrn('Unsigned package');
  inf(`Protocol: ${data.protocol} | Size: ${(data.file_size / 1024).toFixed(1)}kb`);
  br();

  // Download tarball
  const { default: fetch } = await import('node-fetch');
  const dlRes = await fetch(`${REGISTRY}${data.tarball}`);
  if (!dlRes.ok) { err('Download failed'); process.exit(1); }

  const buffer = Buffer.from(await dlRes.arrayBuffer());

  // Extract bundle
  let bundleData;
  try {
    bundleData = JSON.parse(buffer.toString('utf8'));
  } catch {
    err('Could not parse package bundle');
    process.exit(1);
  }

  const installDir = join(outDir, pkgName);
  if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });

  for (const file of bundleData.files) {
    const content = Buffer.from(file.content, 'base64');
    const dest    = join(installDir, file.name);
    writeFileSync(dest, content);
    ok(`Extracted: ${file.name}`);
  }

  ok(`Installed to: ${installDir}`);
  inf(`Add to fxmanifest.lua: ${c('dim', `ensure ${pkgName}`)}`);
  br();
}

// ─────────────────────────────────────────
// COMMAND: search
// ─────────────────────────────────────────

async function cmdSearch([query]) {
  if (!query) { err('Usage: morp search <query>'); process.exit(1); }

  br();
  inf(`Searching: ${c('bold', query)}`);
  br();

  const { ok: reqOk, data } = await registryFetch(`/packages?q=${encodeURIComponent(query)}&limit=10`);
  if (!reqOk) { err('Search failed'); process.exit(1); }

  if (data.results.length === 0) {
    wrn('No packages found');
    br();
    return;
  }

  for (const pkg of data.results) {
    console.log(`  ${c('bold', pkg.name)}@${pkg.latest || 'none'}  ${c('dim', pkg.description || '')}`);
    console.log(`  ${c('dim', `by ${pkg.author} | ${pkg.downloads} downloads`)}`);
    console.log('');
  }
}

// ─────────────────────────────────────────
// COMMAND: dev
// Hot reload watcher for MORP resources
// ─────────────────────────────────────────

async function cmdDev(args) {
  const dir     = args[0] ? resolve(args[0]) : process.cwd();
  const portArg = args.find(a => a.startsWith('--port='));
  const port    = portArg ? Number(portArg.split('=')[1]) : 7700;

  // Read manifest
  let m;
  try { m = JSON.parse(readFileSync(join(dir, 'morp.json'), 'utf8')); }
  catch { err('No morp.json found in ' + dir); process.exit(1); }

  const { watch } = await import('fs');
  const { createServer } = await import('http');
  const { EventEmitter } = await import('events');
  const { relative: relPath } = await import('path');

  const emitter = new EventEmitter();
  let   changeCount = 0;
  let   debounceTimer = null;

  // Collect watched files
  const scriptFiles = [
    ...(m.scripts?.server ?? []),
    ...(m.scripts?.client ?? []),
    ...(m.scripts?.shared ?? []),
    'morp.json',
  ].map(f => join(dir, f));

  // ── SSE server for live reload signal ──────────────────────
  const server = createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      res.write('data: connected\n\n');

      const onReload = (info) => {
        res.write(`data: ${JSON.stringify(info)}\n\n`);
      };

      emitter.on('reload', onReload);
      req.on('close', () => emitter.off('reload', onReload));
      return;
    }

    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resource: m.name,
        version:  m.version,
        protocol: m.protocol,
        changes:  changeCount,
        watching: scriptFiles.map(f => relPath(dir, f)),
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1', () => {
    br();
    console.log(`  ${c('bold', '◆ MORP Dev Server')}`);
    console.log(`  ${c('cyan', `  Resource: ${m.name}@${m.version}`)}`);
    console.log(`  ${c('dim',  `  SSE:      http://localhost:${port}/events`)}`);
    console.log(`  ${c('dim',  `  Status:   http://localhost:${port}/status`)}`);
    br();
    inf('Watching files:');
    for (const f of scriptFiles) {
      console.log(`    ${c('dim', relPath(dir, f))}`);
    }
    br();
    inf('Waiting for changes... (Ctrl+C to stop)');
    br();
  });

  // ── File watcher ───────────────────────────────────────────
  function handleChange(event, filename) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      changeCount++;
      const ts   = new Date().toISOString();
      const info = { file: filename, event, ts, count: changeCount };

      console.log(`  ${c('yellow', '~')} ${filename} ${c('dim', event)} ${c('dim', ts)}`);

      // Re-hash the changed file for display
      try {
        const fp   = join(dir, filename);
        const hash = createHash('sha256').update(readFileSync(fp)).digest('hex').slice(0, 12);
        console.log(`    ${c('dim', `hash: ${hash}...`)}`);
      } catch {}

      emitter.emit('reload', info);
    }, 80); // 80ms debounce
  }

  // Watch each declared file
  const watchers = [];
  for (const fp of scriptFiles) {
    if (!existsSync(fp)) {
      wrn(`Watch target not found: ${relPath(dir, fp)}`);
      continue;
    }
    try {
      const w = watch(fp, (event) => handleChange(event, relPath(dir, fp)));
      watchers.push(w);
    } catch (e) {
      wrn(`Could not watch ${relPath(dir, fp)}: ${e.message}`);
    }
  }

  // Also watch morp.json for manifest changes
  try {
    const manifestPath = join(dir, 'morp.json');
    if (existsSync(manifestPath)) {
      watch(manifestPath, () => {
        wrn('morp.json changed — restart dev server to pick up new files');
        emitter.emit('reload', { file: 'morp.json', event: 'change', manifest: true });
      });
    }
  } catch {}

  // ── Graceful shutdown ──────────────────────────────────────
  process.on('SIGINT', () => {
    br();
    inf('Stopping dev server...');
    server.close();
    watchers.forEach(w => { try { w.close(); } catch {} });
    br();
    process.exit(0);
  });
}

Object.assign(commands, {
  dev:     cmdDev,
  login:   cmdLogin,
  whoami:  cmdWhoami,
  publish: cmdPublish,
  install: cmdInstall,
  search:  cmdSearch,
});

// Run
if (commands[cmd]) commands[cmd](args);
else cmdInfo();
