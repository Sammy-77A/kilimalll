const router = require('express').Router();
const pool = require('../db/pool');

router.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as ts');
    res.json({ status: 'ok', db: 'connected', ts: result.rows[0].ts });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', detail: err.message });
  }
});

module.exports = router;
