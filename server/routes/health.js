const router = require('express').Router();
const pool = require('../db/pool');

/**
 * GET /api/ping
 * Lightweight ping endpoint with zero DB/service overhead for external cron pings.
 * Responds with 200 OK.
 */
router.get('/ping', (_req, res) => {
  res.status(200).send('OK');
});

/**
 * GET /api/health
 * Returns server and database liveness status.
 * Used by Render health checks and manual verification.
 */
router.get('/health', async (req, res) => {
  const start = Date.now();
  try {
    const result = await pool.query('SELECT NOW() AS ts, current_database() AS db');
    res.json({
      status: 'ok',
      db: 'connected',
      database: result.rows[0].db,
      ts: result.rows[0].ts,
      latency_ms: Date.now() - start,
      env: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      detail: process.env.NODE_ENV === 'production' ? 'Database unavailable' : err.message,
      latency_ms: Date.now() - start,
    });
  }
});

module.exports = router;

