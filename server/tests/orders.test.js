import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');

describe('Phase 7 — Order & Checkout API', () => {

  it('1. Rejects unauthenticated request to POST /api/orders', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ payment_method: 'M-Pesa' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  describe('Authenticated Order Operations', () => {
    let token = '';
    let userId = null;
    let createdOrderId = null;
    let orderNumber = null;

    it('2. Registers a test user for order testing', async () => {
      const email = `order_tester_${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'Password123!',
          name: 'Order Tester',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      token = res.body.accessToken;
      userId = res.body.user.id;
    });

    it('3. Creates an order from items added to cart', async () => {
      // Step A: Add product 1 SKU 1 to cart
      const cartAddRes = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          product_id: 1,
          sku_id: 1,
          quantity: 2,
        });

      expect(cartAddRes.status).toBe(201);

      // Step B: Create order from cart
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shipping_address: {
            recipient_name: 'Jane Doe',
            phone: '0712345678',
            county: 'Nairobi',
            subcounty: 'Westlands',
            area: 'Parklands',
            street_address: '123 Parklands Rd',
          },
          payment_method: 'M-Pesa',
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body).toHaveProperty('message', 'Order created successfully');
      expect(orderRes.body.order).toHaveProperty('id');
      expect(orderRes.body.order).toHaveProperty('order_number');
      expect(orderRes.body.order.status).toBe('pending');
      expect(orderRes.body.order.currency).toBe('KES');
      expect(Array.isArray(orderRes.body.order.items)).toBe(true);
      expect(orderRes.body.order.items.length).toBe(1);

      createdOrderId = orderRes.body.order.id;
      orderNumber = orderRes.body.order.order_number;

      // Step C: Verify cart is now empty
      const cartCheck = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${token}`);

      expect(cartCheck.status).toBe(200);
      expect(cartCheck.body.cart.items.length).toBe(0);
    });

    it('4. Lists user orders via GET /api/orders', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('orders');
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination).toHaveProperty('total');
    });

    it('5. Fetches single order details via GET /api/orders/:id', async () => {
      const res = await request(app)
        .get(`/api/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('order');
      expect(res.body.order.id).toBe(createdOrderId);
      expect(res.body.order.order_number).toBe(orderNumber);
      expect(res.body.order).toHaveProperty('shipping_address');
    });

    it('6. Cancels pending order via PATCH /api/orders/:id/cancel', async () => {
      const res = await request(app)
        .patch(`/api/orders/${createdOrderId}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Order cancelled successfully');
      expect(res.body.order.status).toBe('cancelled');
    });

    it('7. Rejects cancellation of already cancelled order', async () => {
      const res = await request(app)
        .patch(`/api/orders/${createdOrderId}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('8. Rejects order creation when stock is insufficient', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            {
              product_id: 1,
              sku_id: 1,
              quantity: 999999, // Exceeds available stock
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Insufficient stock');
    });
  });
});
