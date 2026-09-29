const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }, // Neon uses valid TLS certs — enforce verification
  max: 5,                   // Neon free tier: keep connections low
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Allow for Neon cold-start wake-up
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

module.exports = pool;
