const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon connection strings include ?sslmode=require — pg handles it automatically
  ssl: { rejectUnauthorized: false },
  max: 5, // Neon free tier: keep connections low
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Neon cold-start can take a moment
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
