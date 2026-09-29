/**
 * Database migration runner.
 * Usage:  node server/db/migrate.js
 *         pnpm migrate
 *
 * Reads SQL files from server/db/migrations/ in numeric order,
 * tracks applied migrations in a `_migrations` table.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const pool = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT filename FROM _migrations ORDER BY id'
  );
  return new Set(rows.map((r) => r.filename));
}

async function runMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    console.log('[migrate] Created migrations directory.');
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Numeric prefix ensures correct order: 001_..., 002_...

  if (files.length === 0) {
    console.log('[migrate] No migration files found. Nothing to run.');
    return;
  }

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] ✓ Already applied: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] → Applying: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✅ Applied: ${file}`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed [${file}]: ${err.message}`);
      }
    }

    if (ran === 0) {
      console.log('[migrate] Database is already up to date.');
    } else {
      console.log(`[migrate] Done. Applied ${ran} migration(s).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[migrate] ❌', err.message);
  process.exit(1);
});
