'use strict';

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../db/database');
const { signJwt, requireAuth } = require('../middleware/auth');

// ── POST /auth/register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'username, email, password required' });

    if (!/^[a-z0-9_\-]{3,32}$/i.test(username))
      return res.status(400).json({ error: 'Username: 3-32 chars, letters/numbers/dash/underscore only' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const exists = await get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (exists) return res.status(409).json({ error: 'Username or email already taken' });

    const id   = uuid();
    const hash = await bcrypt.hash(password, 12);
    const now  = new Date().toISOString();

    await run(
      'INSERT INTO users (id, username, email, password, verified, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [id, username.toLowerCase(), email.toLowerCase(), hash, now, now]
    );

    const token = signJwt({ id, username: username.toLowerCase() });

    res.status(201).json({
      message: 'Account created',
      token,
      user: { id, username: username.toLowerCase(), email: email.toLowerCase() },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const user = await get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signJwt({ id: user.id, username: user.username });

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /auth/me ───────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const user = await get('SELECT id, username, email, public_key, key_id, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── PUT /auth/pubkey ───────────────────────────────────────────────
// Register your Ed25519 public key for resource verification
router.put('/pubkey', requireAuth, async (req, res) => {
  try {
    const { public_key, key_id } = req.body;
    if (!public_key) return res.status(400).json({ error: 'public_key required' });

    if (!public_key.includes('BEGIN PUBLIC KEY'))
      return res.status(400).json({ error: 'Invalid PEM format — must be SPKI public key' });

    await run(
      'UPDATE users SET public_key = ?, key_id = ?, updated_at = ? WHERE id = ?',
      [public_key, key_id || null, new Date().toISOString(), req.user.id]
    );

    res.json({ message: 'Public key registered', key_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/tokens ──────────────────────────────────────────────
router.post('/tokens', requireAuth, async (req, res) => {
  try {
    const { label } = req.body;
    const id    = uuid();
    const token = `morp_${uuid().replace(/-/g, '')}`;
    const now   = new Date().toISOString();

    await run(
      'INSERT INTO api_tokens (id, user_id, token, label, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, req.user.id, token, label || 'default', now]
    );

    res.status(201).json({ id, token, label: label || 'default', created_at: now });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /auth/tokens ───────────────────────────────────────────────
router.get('/tokens', requireAuth, async (req, res) => {
  const tokens = await all(
    'SELECT id, label, last_used, created_at FROM api_tokens WHERE user_id = ?',
    [req.user.id]
  );
  res.json(tokens);
});

// ── DELETE /auth/tokens/:id ────────────────────────────────────────
router.delete('/tokens/:id', requireAuth, async (req, res) => {
  const token = await get('SELECT * FROM api_tokens WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  await run('DELETE FROM api_tokens WHERE id = ?', [req.params.id]);
  res.json({ message: 'Token revoked' });
});

module.exports = router;
