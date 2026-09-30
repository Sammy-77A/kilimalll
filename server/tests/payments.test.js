import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../index.js');

describe('Phase 8 — Payment Integration (PayHero / M-Pesa)', () => {

  it('1. Rejects unauthenticated request to POST /api/payments/initiate', async () => {
    const res = await request(app)
      .post('/api/payments/initiate')
      .send({ order_id: 1, phone_number: '0712345678' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  describe('Authenticated Payment Workflow & Rule A11 Verification', () => {
    let token = '';
    let userId = null;
    let createdOrderId = null;
    let orderNumber = null;

    it('2. Registers user, adds item to cart, and creates an order', async () => {
      // Step A: Register User
      const email = `payment_tester_${Date.now()}@example.com`;
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'Password123!',
          name: 'Payment Tester',
        });

      expect(regRes.status).toBe(201);
      token = regRes.body.accessToken;
      userId = regRes.body.user.id;

      // Step B: Add product 1 to cart
      const cartRes = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, quantity: 1 });
      expect(cartRes.status).toBe(201);

      // Step C: Create Order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shipping_address: {
            recipient_name: 'John Payment',
            phone: '0712345678',
            county: 'Nairobi',
            subcounty: 'Kilimani',
            area: 'Yaya',
            street_address: 'Argwings Kodhek Rd',
          },
          payment_method: 'M-Pesa',
        });

      expect(orderRes.status).toBe(201);
      createdOrderId = orderRes.body.order.id;
      orderNumber = orderRes.body.order.order_number;
    });

    it('3. Initiates M-Pesa STK push and verifies Rule A11 (No "PayHero" in response)', async () => {
      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          order_id: createdOrderId,
          phone_number: '0712345678',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('M-Pesa');
      expect(res.body).toHaveProperty('payment_reference');
      expect(res.body).toHaveProperty('status', 'STK_PUSH_SENT');

      // Rule A11 Assertion: Ensure "PayHero" (case-insensitive) never appears in user-facing JSON response payload
      const responseStr = JSON.stringify(res.body).toLowerCase();
      expect(responseStr).not.toContain('payhero');
    });

    it('4. Checks initial payment status via GET /api/payments/status/:order_id', async () => {
      const res = await request(app)
        .get(`/api/payments/status/${createdOrderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('order_id', createdOrderId);
      expect(res.body).toHaveProperty('payment_status', 'unpaid');
      expect(res.body).toHaveProperty('payment_method', 'M-Pesa');

      // Rule A11 Assertion
      const responseStr = JSON.stringify(res.body).toLowerCase();
      expect(responseStr).not.toContain('payhero');
    });

    it('5. Processes payment webhook success callback (order transitions to paid)', async () => {
      const webhookRes = await request(app)
        .post('/api/payments/webhook')
        .send({
          status: 'SUCCESS',
          success: true,
          external_reference: orderNumber,
          mpesa_receipt: 'QWX98765432',
          amount: 100,
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body).toHaveProperty('received', true);
      expect(webhookRes.body).toHaveProperty('status', 'PAID');

      // Check status updated in database
      const statusCheck = await request(app)
        .get(`/api/payments/status/${createdOrderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(statusCheck.status).toBe(200);
      expect(statusCheck.body.payment_status).toBe('paid');
      expect(statusCheck.body.order_status).toBe('paid');
    });

    it('6. Processes payment webhook failure callback for new order', async () => {
      // Create second order
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ product_id: 1, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          shipping_address: {
            recipient_name: 'John Payment',
            phone: '0712345678',
            county: 'Nairobi',
            subcounty: 'Kilimani',
            area: 'Yaya',
            street_address: 'Argwings Kodhek Rd',
          },
          payment_method: 'M-Pesa',
        });

      const secondOrderId = orderRes.body.order.id;
      const secondOrderNumber = orderRes.body.order.order_number;

      // Trigger failed webhook
      const webhookRes = await request(app)
        .post('/api/payments/webhook')
        .send({
          status: 'FAILED',
          success: false,
          external_reference: secondOrderNumber,
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body).toHaveProperty('status', 'FAILED');

      const statusCheck = await request(app)
        .get(`/api/payments/status/${secondOrderId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(statusCheck.status).toBe(200);
      expect(statusCheck.body.payment_status).toBe('failed');
    });
  });
});
