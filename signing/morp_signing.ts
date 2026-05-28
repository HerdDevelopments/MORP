/**
 * MORP Signing Library
 * Algorithm: Ed25519 (RFC 8032)
 * Used by: morp-cli (keygen, sign, verify)
 *          morp_verifier.lua (adapter-side verification)
 */

import {
  generateKeyPairSync,
  createSign,
  createVerify,
  createHash,
  KeyObject,
} from 'crypto';

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';

import { join, relative } from 'path';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface KeyPair {
  publicKey:  string;   // PEM
  privateKey: string;   // PEM (keep secret)
  keyId:      string;   // sha256[:16] of pubkey — used in .sig for identification
  createdAt:  string;
}

export interface FileEntry {
  path:   string;   // relative path
  hash:   string;   // sha256 hex of file content
  size:   number;
}

export interface BundleManifest {
  name:      string;
  version:   string;
  protocol:  string;
  files:     FileEntry[];
  rootHash:  string;   // sha256 of all file hashes concatenated in sorted order
  builtAt:   string;
}

export interface SignatureFile {
  algorithm:  'Ed25519';
  keyId:      string;
  resource:   string;
  version:    string;
  protocol:   string;
  rootHash:   string;
  signature:  string;   // hex-encoded Ed25519 signature over rootHash
  signedAt:   string;
}

// ─────────────────────────────────────────────────────────────
// KEY GENERATION
// ─────────────────────────────────────────────────────────────

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const keyId = createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .slice(0, 16);

  return {
    publicKey,
    privateKey,
    keyId,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// BUNDLE HASHING
// ─────────────────────────────────────────────────────────────

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function buildBundleManifest(
  resourceDir: string,
  manifest: { name: string; version: string; protocol: string; scripts: Record<string, string[]> }
): BundleManifest {
  const scriptFiles = [
    ...(manifest.scripts?.server ?? []),
    ...(manifest.scripts?.client ?? []),
    ...(manifest.scripts?.shared ?? []),
  ];

  // Always include morp.json itself in the bundle hash
  const allFiles = [...scriptFiles, 'morp.json'];

  const entries: FileEntry[] = allFiles.map(f => {
    const abs = join(resourceDir, f);
    if (!existsSync(abs)) throw new Error(`File not found: ${f}`);
    const content = readFileSync(abs);
    return {
      path: f,
      hash: createHash('sha256').update(content).digest('hex'),
      size: content.length,
    };
  });

  // Sort entries by path for deterministic ordering
  entries.sort((a, b) => a.path.localeCompare(b.path));

  // Root hash = sha256 of all (path + hash) pairs concatenated, sorted
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

// ─────────────────────────────────────────────────────────────
// SIGNING
// ─────────────────────────────────────────────────────────────

export function signBundle(
  bundle: BundleManifest,
  privateKeyPem: string
): SignatureFile {
  const signer = createSign('Ed25519');
  signer.update(bundle.rootHash, 'hex');
  signer.end();

  const sigBuffer = signer.sign({ key: privateKeyPem, format: 'pem', type: 'pkcs8' });
  const signature = sigBuffer.toString('hex');

  // Derive keyId from private key's corresponding public key
  // We store it in the sig file so verifiers can find the right public key
  const keyId = createHash('sha256')
    .update(privateKeyPem)
    .digest('hex')
    .slice(0, 16);

  return {
    algorithm: 'Ed25519',
    keyId,
    resource:  bundle.name,
    version:   bundle.version,
    protocol:  bundle.protocol,
    rootHash:  bundle.rootHash,
    signature,
    signedAt:  new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────────────────────

export interface VerifyResult {
  valid:    boolean;
  reason?:  string;
  keyId?:   string;
  signedAt?: string;
}

export function verifyBundle(
  resourceDir: string,
  sigFile: SignatureFile,
  publicKeyPem: string
): VerifyResult {
  // 1. Recompute root hash from current files on disk
  let currentBundle: BundleManifest;
  try {
    const morpJson = JSON.parse(readFileSync(join(resourceDir, 'morp.json'), 'utf8'));
    currentBundle  = buildBundleManifest(resourceDir, morpJson);
  } catch (e: any) {
    return { valid: false, reason: `Failed to hash bundle: ${e.message}` };
  }

  // 2. Compare root hashes
  if (currentBundle.rootHash !== sigFile.rootHash) {
    return {
      valid:  false,
      reason: `Root hash mismatch — resource may have been tampered with.\n` +
              `  Expected: ${sigFile.rootHash}\n` +
              `  Got:      ${currentBundle.rootHash}`,
    };
  }

  // 3. Verify Ed25519 signature
  try {
    const verifier = createVerify('Ed25519');
    verifier.update(sigFile.rootHash, 'hex');
    verifier.end();

    const sigBuffer = Buffer.from(sigFile.signature, 'hex');
    const isValid   = verifier.verify(
      { key: publicKeyPem, format: 'pem', type: 'spki' },
      sigBuffer
    );

    if (!isValid) {
      return { valid: false, reason: 'Signature verification failed — invalid signature' };
    }
  } catch (e: any) {
    return { valid: false, reason: `Verification error: ${e.message}` };
  }

  return {
    valid:    true,
    keyId:    sigFile.keyId,
    signedAt: sigFile.signedAt,
  };
}
