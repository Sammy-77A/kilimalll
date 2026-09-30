/**
 * Phase 3 — Integration tests for Authentication API and Ping Endpoint.
 * Run with: pnpm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');

const hasDb = !!process.env.DATABASE_URL;

describe('Phase 3 — Authentication & Ping API', () => {

  // ── Ping Endpoint ──────────────────────────────────────────────────────────
  describe('GET /api/ping', () => {
    it('returns 200 OK with plain text "OK"', async () => {
      const res = await request(app).get('/api/ping');
      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });
  });

  // ── Auth Endpoints Validation ─────────────────────────────────────────────
  describe('POST /api/auth/register — input validation', () => {
    it('returns 422 if email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 422 if password is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@kilimall.ke', password: '123' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/login — input validation', () => {
    it('returns 422 if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/auth/me — authentication middleware', () => {
    it('returns 401 if Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 if token is malformed', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ── Database Dependent Endpoints Flow ─────────────────────────────────────
  describe('Full Authentication Flow (DB required)', () => {
    const testEmail = `user_${Date.now()}@kilimall.ke`;
    const testPassword = 'SecurePassword123!';
    let accessToken = '';
    let refreshToken = '';

    it.skipIf(!hasDb)('1. Registers new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          name: 'Phase 3 Tester',
          phone: '+254799999999',
        });
      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it.skipIf(!hasDb)('2. Re-registering same email returns 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        });
      expect(res.status).toBe(409);
    });

    it.skipIf(!hasDb)('3. Logins user with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it.skipIf(!hasDb)('4. Login with wrong password returns 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword!',
        });
      expect(res.status).toBe(401);
    });

    it.skipIf(!hasDb)('5. Fetches profile via GET /api/auth/me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.name).toBe('Phase 3 Tester');
    });

    it.skipIf(!hasDb)('6. Refreshes token via POST /api/auth/refresh', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it.skipIf(!hasDb)('7. Logs out via POST /api/auth/logout', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logout successful');
    });
  });

});
