import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');

describe('Phase 9 — Frontend & Cookie Auth Integration', () => {
  let testUser = {
    email: `phase9_${Date.now()}@example.com`,
    password: 'password123',
    name: 'Phase9 User',
  };
  let authCookie = '';

  beforeAll(async () => {
    // Register user for testing cookie auth
    const regRes = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(regRes.status).toBe(201);
    
    // Login to get cookies
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    authCookie = cookies.find(c => c.startsWith('accessToken='));
    expect(authCookie).toBeDefined();
  });

  it('GET /sw.js should return 200 with service worker content', async () => {
    const res = await request(app).get('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('CACHE_NAME');
  });

  it('GET /_nuxt/some-asset.js should return 204 No Content fallback', async () => {
    const res = await request(app).get('/_nuxt/some-asset.js');
    expect(res.status).toBe(204);
  });

  it('GET / should serve index.html with kilimall-ui.js script injected', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('kilimall-ui.js');
  });

  it('GET /search/010616.html should serve search page with kilimall-ui.js injected', async () => {
    const res = await request(app).get('/search/010616.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('kilimall-ui.js');
  });

  it('GET /js/kilimall-ui.js should serve frontend bridge script with search logic', async () => {
    const res = await request(app).get('/js/kilimall-ui.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('triggerSearch');
    expect(res.text).toContain('loadSearchPageResults');
  });

  it('GET /api/auth/me using HTTP-only cookie should authenticate successfully', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [authCookie]);
    
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
  });
});
