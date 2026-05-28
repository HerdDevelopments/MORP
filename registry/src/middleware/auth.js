'use strict';

const jwt  = require('jsonwebtoken');
const { get, run } = require('../db/database');

const JWT_SECRET = process.env.MORP_JWT_SECRET || 'morp-dev-secret-change-in-production';

function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Bearer token middleware — attaches req.user if valid
async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if it's an API token (stored in DB)
  const apiToken = await get(
    'SELECT t.*, u.id as uid, u.username, u.email, u.public_key, u.key_id FROM api_tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ?',
    [token]
  );

  if (apiToken) {
    await run('UPDATE api_tokens SET last_used = ? WHERE id = ?', [
      new Date().toISOString(), apiToken.id,
    ]);
    req.user = {
      id:         apiToken.uid,
      username:   apiToken.username,
      email:      apiToken.email,
      public_key: apiToken.public_key,
      key_id:     apiToken.key_id,
    };
    return next();
  }

  // Try JWT
  try {
    const payload = verifyJwt(token);
    const user    = await get('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth — attaches req.user if token present, otherwise continues
async function optionalAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const apiToken = await get(
      'SELECT t.*, u.id as uid, u.username FROM api_tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ?',
      [token]
    );
    if (apiToken) {
      req.user = { id: apiToken.uid, username: apiToken.username };
    } else {
      const payload = verifyJwt(token);
      req.user = payload;
    }
  } catch {}

  next();
}

module.exports = { signJwt, verifyJwt, requireAuth, optionalAuth };
