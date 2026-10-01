import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const app = require('../index.js');
const paymentsRouter = require('../routes/payments');

const WEBHOOK_TOKEN = 'test-webhook-token-0123456789';
const WEBHOOK_URL = `/api/payments/webhook?token=${WEBHOOK_TOKEN}`;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SHIPPING = {
  recipient_name: 'John Payment',
  phone: '0712345678',
  county: 'Nairobi',
  subcounty: 'Kilimani',
  area: 'Yaya',
  street_address: 'Argwings Kodhek Rd',
};

async function registerUser(label) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `${label}_${Date.now()}@example.com`, password: 'Password123!', name: 'Payment Tester' });
  expect(res.status).toBe(201);
  return res.body.accessToken;
}

async function createOrder(token) {
  const cartRes = await request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ product_id: 1, quantity: 1 });
  expect(cartRes.status).toBe(201);

  const orderRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ shipping_address: SHIPPING, payment_method: 'M-Pesa' });
  expect(orderRes.status).toBe(201);
  return orderRes.body.order;
}

async function paymentStatus(token, orderId) {
  const res = await request(app)
    .get(`/api/payments/status/${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body;
}

// Default for this file: sandbox mode with a webhook token. Individual tests override and restore.
const ORIGINAL_ENV = { ...process.env };
function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  process.env.PAYMENTS_SANDBOX = 'true';
  process.env.PAYHERO_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  paymentsRouter.__setPayHeroClientForTests(null);
}

describe('Phase 8 — Payment Integration (sandbox mode)', () => {
  beforeAll(resetEnv);
  afterEach(resetEnv);

  it('1. Rejects unauthenticated request to POST /api/payments/initiate', async () => {
    const res = await request(app)
      .post('/api/payments/initiate')
      .send({ order_id: 1, phone_number: '0712345678' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  describe('Authenticated Payment Workflow & Rule A11 Verification', () => {
    let token = '';
    let order = null;

    it('2. Registers user, adds item to cart, and creates an order', async () => {
      token = await registerUser('payment_tester');
      order = await createOrder(token);
    });

    it('3. Initiates M-Pesa STK push and verifies Rule A11 (No "PayHero" in response)', async () => {
      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({ order_id: order.id, phone_number: '0712345678' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('M-Pesa');
      expect(res.body).toHaveProperty('payment_reference');
      expect(res.body).toHaveProperty('status', 'STK_PUSH_SENT');

      const responseStr = JSON.stringify(res.body).toLowerCase();
      expect(responseStr).not.toContain('payhero');
    });

    it('4. Checks initial payment status via GET /api/payments/status/:order_id', async () => {
      const body = await paymentStatus(token, order.id);
      expect(body).toHaveProperty('order_id', order.id);
      expect(body).toHaveProperty('payment_status', 'unpaid');
      expect(body).toHaveProperty('payment_method', 'M-Pesa');
      expect(JSON.stringify(body).toLowerCase()).not.toContain('payhero');
    });

    it('5. Rejects invalid phone numbers with a 422 and clear message', async () => {
      const res = await request(app)
        .post('/api/payments/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({ order_id: order.id, phone_number: '12345678901' });

      expect(res.status).toBe(422);
      expect(res.body.details[0].message).toMatch(/valid Kenyan M-Pesa number/);
    });

    it('6. Webhook rejects callbacks with no token or a wrong token', async () => {
      const body = { status: 'SUCCESS', success: true, external_reference: order.order_number };

      const noToken = await request(app).post('/api/payments/webhook').send(body);
      expect(noToken.status).toBe(401);

      const wrongToken = await request(app).post('/api/payments/webhook?token=nope').send(body);
      expect(wrongToken.status).toBe(401);

      const status = await paymentStatus(token, order.id);
      expect(status.payment_status).toBe('unpaid'); // forged callbacks changed nothing
    });

    it('7. Webhook fails closed (503) when PAYHERO_WEBHOOK_TOKEN is not configured', async () => {
      delete process.env.PAYHERO_WEBHOOK_TOKEN;
      const res = await request(app)
        .post('/api/payments/webhook')
        .send({ status: 'SUCCESS', success: true, external_reference: order.order_number });
      expect(res.status).toBe(503);
    });

    it('8. Webhook ignores a callback whose amount differs from the order total', async () => {
      const res = await request(app)
        .post(WEBHOOK_URL)
        .send({ status: 'SUCCESS', success: true, external_reference: order.order_number, amount: 1 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('IGNORED');
      const status = await paymentStatus(token, order.id);
      expect(status.payment_status).toBe('unpaid');
    });

    it('9. Processes a valid success callback (nested gateway-style payload) and marks the order paid', async () => {
      const res = await request(app)
        .post(WEBHOOK_URL)
        .send({
          status: true,
          response: {
            Status: 'Success',
            ExternalReference: order.order_number,
            Amount: parseFloat(order.total_amount),
            MpesaReceiptNumber: 'QWX98765432',
            Phone: '254712345678',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('received', true);
      expect(res.body).toHaveProperty('status', 'PAID');

      const status = await paymentStatus(token, order.id);
      expect(status.payment_status).toBe('paid');
      expect(status.order_status).toBe('paid');
    });

    it('10. A later FAILED callback cannot downgrade an order that is already paid', async () => {
      const res = await request(app)
        .post(WEBHOOK_URL)
        .send({ status: 'FAILED', success: false, external_reference: order.order_number });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PAID');
      const status = await paymentStatus(token, order.id);
      expect(status.payment_status).toBe('paid');
      expect(status.order_status).toBe('paid');
    });

    it('11. Processes a failure callback for a new unpaid order', async () => {
      const second = await createOrder(token);

      const res = await request(app)
        .post(WEBHOOK_URL)
        .send({ status: 'FAILED', success: false, external_reference: second.order_number });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'FAILED');
      const status = await paymentStatus(token, second.id);
      expect(status.payment_status).toBe('failed');
    });

    it('12. A success callback for a cancelled order is ignored (needs manual refund)', async () => {
      const third = await createOrder(token);
      const cancel = await request(app)
        .patch(`/api/orders/${third.id}/cancel`)
        .set('Authorization', `Bearer ${token}`);
      expect(cancel.status).toBe(200);

      const res = await request(app)
        .post(WEBHOOK_URL)
        .send({ status: 'SUCCESS', success: true, external_reference: third.order_number });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('IGNORED');
      const status = await paymentStatus(token, third.id);
      expect(status.payment_status).toBe('unpaid');
      expect(status.order_status).toBe('cancelled');
    });
  });
});

describe('Phase 8 — Payment Integration (live mode with a fake gateway)', () => {
  let token = '';

  function useLiveMode(client) {
    process.env.PAYMENTS_SANDBOX = 'false';
    process.env.PAYHERO_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
    process.env.PAYHERO_CALLBACK_URL = 'https://shop.example.com/api/payments/webhook';
    paymentsRouter.__setPayHeroClientForTests(client);
  }

  beforeAll(async () => {
    resetEnv();
    token = await registerUser('live_payment_tester');
  });
  afterEach(resetEnv);

  it('sends the STK push to the gateway with our order number and a tokenised callback URL', async () => {
    const order = await createOrder(token);
    const client = {
      stkPush: vi.fn().mockResolvedValue({ success: true, status: 'QUEUED', reference: 'ref-live-0001' }),
      transactionStatus: vi.fn(),
    };
    useLiveMode(client);

    const res = await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.id, phone_number: '0712345678' });

    expect(res.status).toBe(200);
    expect(res.body.payment_reference).toBe('ref-live-0001');
    const sent = client.stkPush.mock.calls[0][0];
    expect(sent.external_reference).toBe(order.order_number);
    expect(sent.phone_number).toBe('254712345678');
    expect(sent.amount).toBe(parseFloat(order.total_amount));
    const callback = new URL(sent.callback_url);
    expect(callback.origin + callback.pathname).toBe('https://shop.example.com/api/payments/webhook');
    expect(callback.searchParams.get('token')).toBe(WEBHOOK_TOKEN);
  });

  it('returns 502 (not a fake success) when the gateway rejects the STK push', async () => {
    const order = await createOrder(token);
    useLiveMode({
      stkPush: vi.fn().mockRejectedValue(new Error('Invalid phone number format')),
      transactionStatus: vi.fn(),
    });

    const res = await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.id, phone_number: '0712345678' });

    expect(res.status).toBe(502);
    expect(res.body.status).toBeUndefined();
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('payhero');
  });

  it('returns 503 in production when no gateway credentials are configured', async () => {
    const order = await createOrder(token);
    process.env.PAYMENTS_SANDBOX = 'false';
    delete process.env.PAYHERO_USERNAME;
    delete process.env.PAYHERO_PASSWORD;
    process.env.NODE_ENV = 'production';

    const res = await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.id, phone_number: '0712345678' });

    expect(res.status).toBe(503);
  });

  it('does not trust a forged SUCCESS callback — the gateway decides', async () => {
    const order = await createOrder(token);
    const client = {
      stkPush: vi.fn().mockResolvedValue({ success: true, reference: 'ref-live-0002' }),
      transactionStatus: vi.fn().mockResolvedValue({ status: 'QUEUED' }),
    };
    useLiveMode(client);

    await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.id, phone_number: '0712345678' })
      .expect(200);

    // Attacker-style callback: claims success and supplies a different reference.
    const forged = await request(app)
      .post(WEBHOOK_URL)
      .send({ status: 'SUCCESS', success: true, external_reference: order.order_number, reference: 'attacker-ref-999' });

    expect(forged.status).toBe(200);
    expect(forged.body.status).toBe('PENDING');
    expect(client.transactionStatus).toHaveBeenCalledWith('ref-live-0002'); // our stored reference only
    expect((await paymentStatus(token, order.id)).payment_status).toBe('unpaid');

    // Gateway now confirms the payment: the same kind of callback marks it paid.
    client.transactionStatus.mockResolvedValue({ status: 'SUCCESS' });
    const genuine = await request(app)
      .post(WEBHOOK_URL)
      .send({ external_reference: order.order_number });
    expect(genuine.status).toBe(200);
    expect(genuine.body.status).toBe('PAID');
    expect((await paymentStatus(token, order.id)).payment_status).toBe('paid');
  });

  it('marks the payment failed only when the gateway reports FAILED, and 502s when it cannot verify', async () => {
    const order = await createOrder(token);
    const client = {
      stkPush: vi.fn().mockResolvedValue({ success: true, reference: 'ref-live-0003' }),
      transactionStatus: vi.fn().mockRejectedValue(new Error('network down')),
    };
    useLiveMode(client);

    await request(app)
      .post('/api/payments/initiate')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.id, phone_number: '0712345678' })
      .expect(200);

    const unverifiable = await request(app).post(WEBHOOK_URL).send({ external_reference: order.order_number });
    expect(unverifiable.status).toBe(502);
    expect((await paymentStatus(token, order.id)).payment_status).toBe('unpaid');

    client.transactionStatus.mockResolvedValue({ status: 'FAILED' });
    const failed = await request(app).post(WEBHOOK_URL).send({ external_reference: order.order_number });
    expect(failed.status).toBe(200);
    expect(failed.body.status).toBe('FAILED');
    expect((await paymentStatus(token, order.id)).payment_status).toBe('failed');
  });
});

describe('Production safety — JWT secrets', () => {
  const run = (env) =>
    execFileSync(process.execPath, ['-e', "require('./server/utils/jwt'); console.log('loaded')"], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  it('refuses to load in production without real JWT secrets', () => {
    expect(() => run({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET must be set/);
    expect(() => run({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64) })).toThrow(/JWT_REFRESH_SECRET must be set/);
    expect(() => run({ NODE_ENV: 'production', JWT_SECRET: 'replace_with_64_byte_random_hex', JWT_REFRESH_SECRET: 'b'.repeat(64) }))
      .toThrow(/JWT_SECRET must be set/);
  });

  it('loads in production when both secrets are set, and in development without them', () => {
    expect(run({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64) })).toContain('loaded');
    expect(run({ NODE_ENV: 'development' })).toContain('loaded');
  });
});
