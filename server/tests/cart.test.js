/**
 * Phase 6 — Integration tests for Cart API (`GET /api/cart`, `POST /api/cart/items`, `PUT /api/cart/items/:id`, `DELETE /api/cart/items/:id`, `POST /api/cart/merge`).
 * Run with: pnpm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');
const { generateAccessToken } = require('../utils/jwt');

const hasDb = !!process.env.DATABASE_URL;

describe('Phase 6 — Cart API', () => {
  const testUser = { userId: 1, email: 'customer@kilimall.ke', role: 'customer' };
  const token = generateAccessToken(testUser);

  // ── Authentication Check ──────────────────────────────────────────────────
  describe('Cart Auth Protection', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ── Full Cart Lifecycle ───────────────────────────────────────────────────
  describe('Cart Operations (DB required)', () => {
    let createdItemId = 0;

    it.skipIf(!hasDb)('1. Fetches initial user cart (empty or seeded)', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('cart');
      expect(res.body.cart).toHaveProperty('items');
      expect(typeof res.body.cart.subtotal).toBe('number');
    });

    it.skipIf(!hasDb)('2. Adds product to cart via POST /api/cart/items', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, sku_id: 1, quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('item');
      expect(res.body.item.product_id).toBe(1);
      expect(res.body.item.sku_id).toBe(1);
      createdItemId = res.body.item.id;
    });

    it.skipIf(!hasDb)('3. Increments quantity when adding same product/SKU again', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, sku_id: 1, quantity: 1 });

      expect(res.status).toBe(201);
      expect(res.body.item.id).toBe(createdItemId);
      expect(res.body.item.quantity).toBeGreaterThanOrEqual(3);
    });

    it.skipIf(!hasDb)('4. Updates item quantity via PUT /api/cart/items/:id', async () => {
      const res = await request(app)
        .put(`/api/cart/items/${createdItemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.item.quantity).toBe(5);
    });

    it.skipIf(!hasDb)('5. Merges guest cart items via POST /api/cart/merge', async () => {
      const res = await request(app)
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { product_id: 2, sku_id: 3, quantity: 1 },
            { product_id: 3, sku_id: 4, quantity: 2 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Cart merged successfully');
    });

    it.skipIf(!hasDb)('6. Verifies merged cart contents via GET /api/cart', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.cart.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body.cart.subtotal).toBeGreaterThan(0);
    });

    it.skipIf(!hasDb)('7. Removes item from cart via DELETE /api/cart/items/:id', async () => {
      const res = await request(app)
        .delete(`/api/cart/items/${createdItemId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdItemId);
    });
  });

});
