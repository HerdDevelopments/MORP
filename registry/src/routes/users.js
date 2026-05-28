'use strict';

const router = require('express').Router();
const { get, all } = require('../db/database');

// GET /users/:username
router.get('/:username', async (req, res) => {
  try {
    const user = await get(
      'SELECT id, username, public_key, key_id, created_at FROM users WHERE username = ?',
      [req.params.username.toLowerCase()]
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    const packages = await all(
      'SELECT name, description, latest, downloads, tags, updated_at FROM packages WHERE owner_id = ? ORDER BY downloads DESC',
      [user.id]
    );

    res.json({
      username:    user.username,
      key_id:      user.key_id,
      has_pubkey:  !!user.public_key,
      member_since:user.created_at,
      packages:    packages.map(p => ({
        ...p,
        tags: (() => { try { return JSON.parse(p.tags); } catch { return []; } })(),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
