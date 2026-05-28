'use strict';
/**
 * MORP Registry Server
 * npm-style resource registry for MORP-compliant FiveM resources
 */

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const fs          = require('fs');

const { migrate } = require('./db/database');

// Ensure data directories exist
const DATA_DIR    = process.env.MORP_DATA_PATH    || path.join(__dirname, '../data');
const STORAGE_DIR = process.env.MORP_STORAGE_PATH || path.join(DATA_DIR, 'tarballs');

[DATA_DIR, STORAGE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─────────────────────────────────────────
// APP
// ─────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin:  process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      300,
  message:  { error: 'Too many requests — try again later' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const publishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      30,
  message:  { error: 'Publish rate limit exceeded — 30 publishes per hour' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Too many auth attempts' },
});

app.use(globalLimiter);

// ── Request logger ────────────────────────────────────────────
app.use((req, _, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────

app.use('/auth',            authLimiter,    require('./routes/auth'));
app.use('/packages',                        require('./routes/packages'));
app.use('/packages/:name/publish',          publishLimiter, (req, res, next) => next());
app.use('/users',                           require('./routes/users'));
app.use('/stats',                           require('./routes/stats'));
app.use('/health',                          require('./routes/stats'));

// ── Registry root ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name:        'MORP Registry',
    description: 'Modding Open Resource Protocol — Resource Registry',
    protocol:    '0.2',
    endpoints: {
      search:   'GET  /packages?q=&tag=&author=',
      package:  'GET  /packages/:name',
      version:  'GET  /packages/:name/:version',
      download: 'GET  /packages/:name/:version/download',
      publish:  'POST /packages/:name/publish',
      register: 'POST /auth/register',
      login:    'POST /auth/login',
      profile:  'GET  /users/:username',
      stats:    'GET  /stats',
      health:   'GET  /health',
    },
  });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────
// START
// ─────────────────────────────────────────

async function start() {
  try {
    await migrate();
    app.listen(PORT, () => {
      console.log('');
      console.log('  ◆ MORP Registry');
      console.log(`  ◆ Listening on http://localhost:${PORT}`);
      console.log(`  ◆ Protocol: 0.2`);
      console.log(`  ◆ DB: ${process.env.MORP_DB_PATH || path.join(DATA_DIR, 'registry.db')}`);
      console.log('');
    });
  } catch (e) {
    console.error('Failed to start registry:', e);
    process.exit(1);
  }
}

start();
