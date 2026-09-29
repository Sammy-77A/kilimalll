/**
 * Phase 1 — Integration tests for the Express server.
 * Run with: pnpm test
 *
 * Uses supertest to send HTTP requests to the app without binding a port.
 * DATABASE_URL-dependent tests are skipped when the env var is absent.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
// createRequire lets us import the CJS Express app from an ESM test file
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const app = require('../index.js');

const hasDb = !!process.env.DATABASE_URL;

describe('Phase 1 — Foundation & Infrastructure', () => {

  // ── Static file serving ────────────────────────────────────────────────────
  describe('Static file serving', () => {
    it('GET / returns 200 and HTML', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    it('GET /download returns 200 and HTML', async () => {
      const res = await request(app).get('/download');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    it('GET /sitemap returns 200 and HTML', async () => {
      const res = await request(app).get('/sitemap');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    it('GET /unknown-deep-route falls through to SPA (index.html)', async () => {
      const res = await request(app).get('/some/deep/unknown/route');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  // ── Security headers ───────────────────────────────────────────────────────
  describe('Security headers (helmet)', () => {
    it('X-Frame-Options header is present', async () => {
      const res = await request(app).get('/');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('X-Content-Type-Options is nosniff', async () => {
      const res = await request(app).get('/');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  describe('CORS', () => {
    it('access-control-allow-origin header is present on API requests', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  // ── Health endpoint — response shape ───────────────────────────────────────
  describe('GET /api/health — response shape', () => {
    it('responds with JSON content-type', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('status field is "ok" or "error"', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body).toHaveProperty('status');
      expect(['ok', 'error']).toContain(res.body.status);
    });

    it('latency_ms is a non-negative number', async () => {
      const res = await request(app).get('/api/health');
      expect(typeof res.body.latency_ms).toBe('number');
      expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('env field is present', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body).toHaveProperty('env');
    });
  });

  // ── Health endpoint — database (skipped without DATABASE_URL) ──────────────
  describe('GET /api/health — database', () => {
    it.skipIf(!hasDb)(
      '200 and db=connected when DATABASE_URL is set',
      async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.db).toBe('connected');
        expect(res.body.database).toBeTruthy();
        expect(res.body.ts).toBeTruthy();
      }
    );

    it.skipIf(hasDb)(
      '503 and db=disconnected when DATABASE_URL is not set',
      async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('error');
        expect(res.body.db).toBe('disconnected');
      }
    );
  });

});
