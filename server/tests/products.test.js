/**
 * Phase 4 — Integration tests for Product Catalog API (`/api/categories`, `/api/products`, `/api/products/:id`, `/api/search`).
 * Run with: pnpm test
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');

const hasDb = !!process.env.DATABASE_URL;

describe('Phase 4 — Product Catalog API', () => {

  // ── Categories Endpoint ───────────────────────────────────────────────────
  describe('GET /api/categories', () => {
    it.skipIf(!hasDb)('returns 200 OK and category tree with subcategories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categories');
      expect(Array.isArray(res.body.categories)).toBe(true);

      if (res.body.categories.length > 0) {
        const cat = res.body.categories[0];
        expect(cat).toHaveProperty('id');
        expect(cat).toHaveProperty('name');
        expect(cat).toHaveProperty('slug');
        expect(cat).toHaveProperty('subcategories');
        expect(Array.isArray(cat.subcategories)).toBe(true);
      }
    });
  });

  // ── Products List Endpoint ────────────────────────────────────────────────
  describe('GET /api/products', () => {
    it.skipIf(!hasDb)('returns 200 OK with product list and pagination metadata', async () => {
      const res = await request(app).get('/api/products?page=1&limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('products');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    it.skipIf(!hasDb)('filters products by price range', async () => {
      const res = await request(app).get('/api/products?min_price=15000&max_price=20000');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      res.body.products.forEach((p) => {
        const price = parseFloat(p.price);
        expect(price).toBeGreaterThanOrEqual(15000);
        expect(price).toBeLessThanOrEqual(20000);
      });
    });

    it.skipIf(!hasDb)('sorts products by price ascending', async () => {
      const res = await request(app).get('/api/products?sort=price_asc');
      expect(res.status).toBe(200);
      const prices = res.body.products.map((p) => parseFloat(p.price));
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });
  });

  // ── Product Details Endpoint ──────────────────────────────────────────────
  describe('GET /api/products/:id', () => {
    it.skipIf(!hasDb)('returns 200 OK with product details, images, skus, and flash sale info', async () => {
      const res = await request(app).get('/api/products/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('product');
      const p = res.body.product;
      expect(p.id).toBe(1);
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('images');
      expect(p).toHaveProperty('skus');
      expect(p).toHaveProperty('flash_sale');
      expect(Array.isArray(p.images)).toBe(true);
      expect(Array.isArray(p.skus)).toBe(true);
    });

    it.skipIf(!hasDb)('fetches product by slug', async () => {
      const res = await request(app).get('/api/products/infinix-hot-30-8gb-128gb');
      expect(res.status).toBe(200);
      expect(res.body.product.slug).toBe('infinix-hot-30-8gb-128gb');
    });

    it.skipIf(!hasDb)('returns 404 for non-existent product', async () => {
      const res = await request(app).get('/api/products/999999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });

  // ── Search Endpoint ───────────────────────────────────────────────────────
  describe('GET /api/search', () => {
    it.skipIf(!hasDb)('searches products by query string', async () => {
      const res = await request(app).get('/api/search?q=Infinix');
      expect(res.status).toBe(200);
      expect(res.body.query).toBe('Infinix');
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.products[0].name).toMatch(/Infinix/i);
    });

    it.skipIf(!hasDb)('returns empty array when query is blank', async () => {
      const res = await request(app).get('/api/search?q=');
      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });
  });

});
