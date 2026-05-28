'use strict';

const router = require('express').Router();
const { get, all } = require('../db/database');

// GET /stats
router.get('/', async (req, res) => {
  try {
    const [pkgCount, verCount, userCount, dlCount] = await Promise.all([
      get('SELECT COUNT(*) as n FROM packages'),
      get('SELECT COUNT(*) as n FROM versions'),
      get('SELECT COUNT(*) as n FROM users'),
      get('SELECT SUM(downloads) as n FROM packages'),
    ]);

    const topPackages = await all(
      'SELECT p.name, p.description, p.latest, p.downloads, u.username as author FROM packages p JOIN users u ON p.owner_id = u.id ORDER BY p.downloads DESC LIMIT 10'
    );

    const recentPackages = await all(
      'SELECT p.name, p.description, p.latest, p.created_at, u.username as author FROM packages p JOIN users u ON p.owner_id = u.id ORDER BY p.created_at DESC LIMIT 10'
    );

    res.json({
      packages:    pkgCount?.n ?? 0,
      versions:    verCount?.n ?? 0,
      users:       userCount?.n ?? 0,
      downloads:   dlCount?.n ?? 0,
      top:         topPackages,
      recent:      recentPackages,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /health
router.get('/health', async (req, res) => {
  try {
    await get('SELECT 1');
    res.json({
      status:   'ok',
      version:  '1.0.0',
      protocol: '0.2',
      uptime:   process.uptime(),
      time:     new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({ status: 'error', error: e.message });
  }
});

module.exports = router;
