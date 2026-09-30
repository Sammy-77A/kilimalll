/**
 * Phase 5 — Integration tests for Homepage & CMS Content API (`/api/banners`, `/api/flash-sales`, `/api/search-keywords/hot`, `/api/products/featured`).
 * Run with: pnpm test
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');

const hasDb = !!process.env.DATABASE_URL;

describe('Phase 5 — Homepage & CMS Content API', () => {

  // ── Banners Endpoint ─────────────────────────────────────────────────────
  describe('GET /api/banners', () => {
    it.skipIf(!hasDb)('returns 200 OK and array of active banners', async () => {
      const res = await request(app).get('/api/banners');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('banners');
      expect(Array.isArray(res.body.banners)).toBe(true);

      if (res.body.banners.length > 0) {
        const b = res.body.banners[0];
        expect(b).toHaveProperty('id');
        expect(b).toHaveProperty('title');
        expect(b).toHaveProperty('image_url');
        expect(b).toHaveProperty('target_url');
        expect(b).toHaveProperty('banner_type');
      }
    });

    it.skipIf(!hasDb)('filters banners by banner_type', async () => {
      const res = await request(app).get('/api/banners?type=home_top');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.banners)).toBe(true);
      res.body.banners.forEach((b) => {
        expect(b.banner_type).toBe('home_top');
      });
    });
  });

  // ── Flash Sales Endpoint ─────────────────────────────────────────────────
  describe('GET /api/flash-sales', () => {
    it.skipIf(!hasDb)('returns 200 OK and currently active flash sale deals', async () => {
      const res = await request(app).get('/api/flash-sales');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('flash_sales');
      expect(Array.isArray(res.body.flash_sales)).toBe(true);

      if (res.body.flash_sales.length > 0) {
        const fs = res.body.flash_sales[0];
        expect(fs).toHaveProperty('id');
        expect(fs).toHaveProperty('product_id');
        expect(fs).toHaveProperty('flash_price');
        expect(fs).toHaveProperty('product_name');
        expect(fs).toHaveProperty('product_slug');
      }
    });
  });

  // ── Hot Search Keywords Endpoint ──────────────────────────────────────────
  describe('GET /api/search-keywords/hot', () => {
    it.skipIf(!hasDb)('returns 200 OK and array of hot search keywords', async () => {
      const res = await request(app).get('/api/search-keywords/hot?limit=5');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keywords');
      expect(Array.isArray(res.body.keywords)).toBe(true);

      if (res.body.keywords.length > 0) {
        const kw = res.body.keywords[0];
        expect(kw).toHaveProperty('id');
        expect(kw).toHaveProperty('keyword');
        expect(kw.is_hot).toBe(true);
      }
    });
  });

  // ── Featured Products Endpoint ───────────────────────────────────────────
  describe('GET /api/products/featured', () => {
    it.skipIf(!hasDb)('returns 200 OK and array of featured products', async () => {
      const res = await request(app).get('/api/products/featured?limit=4');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('products');
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeLessThanOrEqual(4);

      if (res.body.products.length > 0) {
        const p = res.body.products[0];
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('price');
        expect(p).toHaveProperty('rating_score');
      }
    });
  });

});
