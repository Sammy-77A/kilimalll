import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const app = require('../index.js');
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

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

  // Search pages use relative asset URLs, so they must be served from the root as search.<id>.html.
  it('GET /search.010616.html serves the real search page byte-for-byte (not index.html)', async () => {
    const res = await request(app).get('/search.010616.html');
    expect(res.status).toBe(200);
    const expected = fs.readFileSync(path.join(PUBLIC, 'search.010616.html'), 'utf8');
    const home = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    expect(res.text).toBe(expected);
    expect(res.text).not.toBe(home);
    expect(res.text).toContain('kilimall-ui.js');
  });

  for (const url of ['/search/010616', '/search/010616.html']) {
    it(`GET ${url}?q=tecno redirects to the root page and keeps the query`, async () => {
      const res = await request(app).get(`${url}?q=tecno`).redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/search.010616.html?q=tecno');
    });
  }

  it('every saved search.<id>.html linked from the homepage serves its own page; unsaved ones fall back to the homepage', async () => {
    const home = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const links = [...new Set([...home.matchAll(/href="(search\.[A-Za-z0-9]+\.html)"/g)].map((m) => m[1]))];
    const saved = links.filter((l) => fs.existsSync(path.join(PUBLIC, l)));
    // 39 of the 62 category links were never saved in the snapshot (known content gap).
    expect(saved.length).toBeGreaterThanOrEqual(23);
    for (const link of saved) {
      const res = await request(app).get(`/${link}`);
      expect(res.status).toBe(200);
      expect(res.text).toBe(fs.readFileSync(path.join(PUBLIC, link), 'utf8'));
    }
    const unsaved = links.find((l) => !fs.existsSync(path.join(PUBLIC, l)));
    if (unsaved) {
      const res = await request(app).get(`/${unsaved}`);
      expect(res.status).toBe(200);
      expect(res.text).toBe(home);
    }
  });

  it('the stylesheets and scripts a search page references resolve from its served URL', async () => {
    const page = fs.readFileSync(path.join(PUBLIC, 'search.010616.html'), 'utf8');
    const assets = [
      ...[...page.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="((?:css)\/[^"]+)"/g)].map((m) => [m[1], /css/]),
      ...[...page.matchAll(/<script[^>]*src="((?:js)\/[^"]+)"/g)].map((m) => [m[1], /javascript/]),
    ];
    expect(assets.length).toBeGreaterThan(5);
    for (const [asset, type] of assets) {
      // Relative to /search.010616.html the browser requests /<asset>
      const res = await request(app).get(`/${asset}`);
      expect(res.status, asset).toBe(200);
      expect(res.headers['content-type'], asset).toMatch(type);
    }
  });

  it('GET /search/does-not-exist falls through to the homepage (catch-all)', async () => {
    const res = await request(app).get('/search/does-not-exist');
    expect(res.status).toBe(200);
  });

  it('kilimall-ui.js has no code swallowed by a // comment and reads { keywords }', () => {
    const src = fs.readFileSync(path.join(PUBLIC, 'js', 'kilimall-ui.js'), 'utf8');
    expect(src).not.toMatch(/\/\/[^\n]*\bvar products\b/);
    expect(src).toContain('data.keywords');
    expect(src).toContain('/search.010616.html?q=');
    expect(src).not.toContain('/search/010616');
  });

  it('search results are built by cloning the page\'s own saved card, without its static badges', () => {
    const src = fs.readFileSync(path.join(PUBLIC, 'js', 'kilimall-ui.js'), 'utf8');
    expect(src).toContain("querySelector('.listing-item')");      // prototype = a saved native card
    expect(src).toContain("qsa('.rate, .mark-box', card)");       // static stars/"Brand Official" badges removed
    expect(src).toContain("style.flexWrap = 'wrap'");             // the page's flex rule is scoped elsewhere
    // the saved card really has the elements the clone relies on
    const page = fs.readFileSync(path.join(PUBLIC, 'search.010616.html'), 'utf8');
    for (const cls of ['product-image', 'product-title', 'product-price', 'mark-box']) {
      expect(page, cls).toContain(`class="${cls}`);
    }
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
