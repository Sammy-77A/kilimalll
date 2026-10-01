const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { z } = require('zod');

// ── PayHero SDK ───────────────────────────────────────────────────────────────
// payhero-devkit is an ES Module, so we use a lazy dynamic import wrapper
// that resolves on first use and is cached for subsequent calls.
let _payheroClient = null;

async function getPayHeroClient() {
  if (_payheroClient) return _payheroClient;

  const payheroUsername = process.env.PAYHERO_USERNAME;
  const payheroPassword = process.env.PAYHERO_PASSWORD;

  // Credentials not configured — return null (callers decide whether that means sandbox or an error)
  if (!payheroUsername || !payheroPassword ||
      payheroPassword === 'replace_with_payhero_password') {
    return null;
  }

  try {
    const { PayHeroClient } = await import('payhero-devkit');
    const authToken = 'Basic ' + Buffer.from(`${payheroUsername}:${payheroPassword}`).toString('base64');
    _payheroClient = new PayHeroClient({ authToken });
    return _payheroClient;
  } catch (err) {
    console.error('Failed to initialise PayHeroClient:', err.message);
    return null;
  }
}

// Test seam: lets tests inject a fake gateway client (pass null to reset).
router.__setPayHeroClientForTests = (client) => { _payheroClient = client; };

/**
 * Decide how payments run.
 *  - PAYMENTS_SANDBOX=true      → sandbox: the gateway is never called, a fake reference is issued.
 *  - credentials configured     → live: real STK push, callbacks verified against the gateway.
 *  - no credentials, non-prod   → sandbox (local development / tests).
 *  - no credentials, production → unavailable (client null, sandbox false): fail loudly, never fake a payment.
 */
async function resolveGateway() {
  if (process.env.PAYMENTS_SANDBOX === 'true') return { sandbox: true, client: null };
  const client = await getPayHeroClient();
  if (client) return { sandbox: false, client };
  if (process.env.NODE_ENV !== 'production') return { sandbox: true, client: null };
  return { sandbox: false, client: null };
}

// ── Helper: Format Kenyan Phone Number to 254XXXXXXXXX ───────────────────────
function formatKenyanPhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    cleaned = '254' + cleaned;
  }
  return cleaned;
}

const KENYAN_MOBILE = /^254[17]\d{8}$/;

// ── Helper: callback URL (carries the webhook shared secret) ─────────────────
// Uses PAYHERO_CALLBACK_URL, else BASE_URL, else the production default. Candidates that are
// not valid http(s) URLs are skipped so a bad env var can never break payment initiation.
const DEFAULT_CALLBACK_URL = 'https://kilimalll.onrender.com/api/payments/webhook';

function buildCallbackUrl(token) {
  const candidates = [
    process.env.PAYHERO_CALLBACK_URL,
    process.env.BASE_URL && `${process.env.BASE_URL.replace(/\/+$/, '')}/api/payments/webhook`,
    DEFAULT_CALLBACK_URL,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      if (token) url.searchParams.set('token', token);
      return url.toString();
    } catch (_err) {
      console.warn('[payments] Ignoring invalid callback URL candidate');
    }
  }
  return DEFAULT_CALLBACK_URL;
}

// ── Helper: constant-time token comparison ───────────────────────────────────
function tokensMatch(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Helper: keep phone numbers out of logs ───────────────────────────────────
function maskPhones(text) {
  return text.replace(/\b(?:254|0)([17])\d{6}(\d{2})\b/g, (_m, d, tail) => `254${d}XXXXXX${tail}`);
}

// ── Zod Schemas ───────────────────────────────────────────────────────────────
const initiatePaymentSchema = z.object({
  order_id: z.number().int().positive(),
  phone_number: z.string().min(9, 'Phone number must be at least 9 digits'),
});

// ── POST /api/payments/initiate (M-Pesa STK Push) ────────────────────────────
router.post('/payments/initiate', authenticate, async (req, res, next) => {
  try {
    const validated = initiatePaymentSchema.parse(req.body);
    const userId = req.user.userId;
    const formattedPhone = formatKenyanPhone(validated.phone_number);

    if (!KENYAN_MOBILE.test(formattedPhone)) {
      return res.status(422).json({
        error: 'Validation error',
        details: [{ path: ['phone_number'], message: 'Enter a valid Kenyan M-Pesa number, e.g. 0712345678' }],
      });
    }

    // 1. Fetch Order
    const orderRes = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [validated.order_id, userId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot initiate payment for a cancelled order' });
    }

    const { sandbox, client } = await resolveGateway();
    const webhookToken = process.env.PAYHERO_WEBHOOK_TOKEN;

    // Live payments need a gateway client AND a webhook token, otherwise the
    // customer could pay and we would never be able to accept the callback.
    if (!sandbox && (!client || !webhookToken)) {
      console.error('[payments] Live payments requested but not configured:',
        !client ? 'gateway credentials missing' : 'PAYHERO_WEBHOOK_TOKEN missing');
      return res.status(503).json({ error: 'M-Pesa payments are temporarily unavailable. Please try again later.' });
    }

    // The callback URL carries the shared secret the webhook route requires.
    const callbackUrl = buildCallbackUrl(webhookToken);
    const channelId = parseInt(process.env.PAYHERO_CHANNEL_ID || '1', 10);

    let checkoutReference;

    if (sandbox) {
      checkoutReference = `STK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    } else {
      // 2. Call the gateway via SDK. Any failure is reported to the customer — never faked.
      try {
        const stkResponse = await client.stkPush({
          phone_number: formattedPhone,
          amount: parseFloat(order.total_amount),
          provider: 'm-pesa',
          channel_id: channelId,
          external_reference: order.order_number,
          callback_url: callbackUrl,
        });
        checkoutReference = stkResponse && (stkResponse.reference || stkResponse.CheckoutRequestID);
        if (!checkoutReference || stkResponse.success === false) {
          throw new Error('Gateway did not accept the STK push request');
        }
      } catch (stkErr) {
        console.error('STK push error:', stkErr.message);
        return res.status(502).json({ error: 'We could not start the M-Pesa payment. Please check the phone number and try again.' });
      }
    }

    // 3. Persist reference to order record
    await pool.query(
      `UPDATE orders
       SET payhero_reference = $1, updated_at = NOW()
       WHERE id = $2`,
      [checkoutReference, order.id]
    );

    // Rule A11: Response must never expose internal vendor name "PayHero"
    res.json({
      message: 'M-Pesa STK push initiated. Please check your phone and enter your M-Pesa PIN.',
      order_id: order.id,
      order_number: order.order_number,
      phone_number: formattedPhone,
      amount: order.total_amount,
      currency: 'KES',
      payment_reference: checkoutReference,
      status: 'STK_PUSH_SENT',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: 'Validation error', details: err.issues });
    }
    next(err);
  }
});

// ── POST /api/payments/webhook (Callback from Payment Gateway) ───────────────
// Security model:
//  1. The caller must present PAYHERO_WEBHOOK_TOKEN (?token= or x-webhook-token header).
//  2. In live mode the payload is only used to LOCATE the order. Whether it was paid is
//     decided by asking the gateway about the reference we stored when the STK push
//     was created, so a forged callback cannot mark anything paid.
//  3. Paid orders are never downgraded, cancelled orders are never marked paid, and a
//     reported amount that differs from the order total is ignored.
router.post('/payments/webhook', async (req, res) => {
  try {
    const expectedToken = process.env.PAYHERO_WEBHOOK_TOKEN;
    if (!expectedToken) {
      console.error('[webhook] PAYHERO_WEBHOOK_TOKEN is not set — rejecting callback');
      return res.status(503).json({ error: 'Webhook not configured' });
    }
    const providedToken = req.query.token || req.get('x-webhook-token');
    if (!tokensMatch(providedToken, expectedToken)) {
      console.warn('[webhook] Rejected callback with missing/invalid token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body || {};
    // Logged (phones masked) so the real callback shape can be confirmed from Render logs.
    console.log('Payment Webhook Received:', maskPhones(JSON.stringify(payload)));

    // Normalise across flat and nested payload shapes (nested keys take priority).
    const nested = payload.response && typeof payload.response === 'object' ? payload.response : {};
    const pick = (...keys) => {
      for (const source of [nested, payload]) {
        for (const key of keys) {
          if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
        }
      }
      return undefined;
    };

    const externalReference = pick('external_reference', 'ExternalReference', 'order_number');
    const checkoutReference = pick('reference', 'checkout_id', 'CheckoutRequestID');
    const reportedStatus = String(pick('status', 'Status') ?? '').toUpperCase();
    const reportedSuccess =
      ['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(reportedStatus) ||
      pick('success') === true ||
      String(pick('ResultCode') ?? '') === '0';
    const reportedAmount = parseFloat(pick('Amount', 'amount'));
    const mpesaReceipt = pick('MpesaReceiptNumber', 'receipt', 'mpesa_receipt');

    if (!externalReference && !checkoutReference) {
      return res.status(400).json({ error: 'Missing order reference in webhook payload' });
    }

    // Find corresponding order by external_reference then payhero_reference
    let orderRes;
    if (externalReference) {
      orderRes = await pool.query(`SELECT * FROM orders WHERE order_number = $1`, [String(externalReference)]);
    }
    if ((!orderRes || orderRes.rows.length === 0) && checkoutReference) {
      orderRes = await pool.query(`SELECT * FROM orders WHERE payhero_reference = $1`, [String(checkoutReference)]);
    }

    if (!orderRes || orderRes.rows.length === 0) {
      console.warn('Webhook order lookup failed for ref:', externalReference || checkoutReference);
      return res.status(404).json({ error: 'Order not found for given payment reference' });
    }

    const order = orderRes.rows[0];

    // Idempotency: a paid order stays paid, whatever arrives later.
    if (order.payment_status === 'paid') {
      return res.status(200).json({ received: true, status: 'PAID' });
    }

    if (Number.isFinite(reportedAmount) &&
        Math.abs(reportedAmount - parseFloat(order.total_amount)) > 0.01) {
      console.error(`[webhook] Amount mismatch for ${order.order_number}: reported ${reportedAmount}, expected ${order.total_amount} — ignored`);
      return res.status(200).json({ received: true, status: 'IGNORED' });
    }

    // Decide the outcome: sandbox trusts the (token-authenticated) payload; live asks the gateway.
    const { sandbox, client } = await resolveGateway();
    let outcome; // 'SUCCESS' | 'FAILED' | 'PENDING'

    if (sandbox) {
      outcome = reportedSuccess ? 'SUCCESS' : 'FAILED';
    } else {
      if (!client) {
        console.error('[webhook] Live mode but no gateway client — cannot verify callback');
        return res.status(503).json({ error: 'Payment verification unavailable' });
      }
      const storedReference = order.payhero_reference;
      // Only ever query the gateway with a reference we stored ourselves (the SDK does not escape it).
      if (!storedReference || !/^[A-Za-z0-9_-]{6,100}$/.test(storedReference)) {
        console.error(`[webhook] Order ${order.order_number} has no verifiable gateway reference — ignored`);
        return res.status(200).json({ received: true, status: 'IGNORED' });
      }
      let gatewayStatus;
      try {
        const result = await client.transactionStatus(storedReference);
        gatewayStatus = String(result && result.status).toUpperCase();
      } catch (verifyErr) {
        console.error('[webhook] Gateway verification failed:', verifyErr.message);
        return res.status(502).json({ error: 'Could not verify payment with gateway' });
      }
      outcome = gatewayStatus === 'SUCCESS' ? 'SUCCESS' : gatewayStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    }

    if (outcome === 'PENDING') {
      return res.status(200).json({ received: true, status: 'PENDING' });
    }

    if (outcome === 'SUCCESS') {
      if (order.status === 'cancelled' || order.status === 'refunded') {
        console.error(`[webhook] PAYMENT RECEIVED FOR ${order.status.toUpperCase()} ORDER ${order.order_number} — needs manual refund. Receipt: ${mpesaReceipt || 'N/A'}`);
        return res.status(200).json({ received: true, status: 'IGNORED' });
      }
      await pool.query(
        `UPDATE orders
         SET status = 'paid', payment_status = 'paid', updated_at = NOW()
         WHERE id = $1 AND payment_status <> 'paid' AND status NOT IN ('cancelled', 'refunded')`,
        [order.id]
      );
      console.log(`Order ${order.order_number} marked as PAID. Receipt: ${mpesaReceipt || 'N/A'}`);
      return res.status(200).json({ received: true, status: 'PAID' });
    }

    // FAILED: only an unpaid order can move to failed.
    await pool.query(
      `UPDATE orders
       SET payment_status = 'failed', updated_at = NOW()
       WHERE id = $1 AND payment_status = 'unpaid'`,
      [order.id]
    );
    console.log(`Order ${order.order_number} payment FAILED.`);
    return res.status(200).json({ received: true, status: 'FAILED' });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// ── GET /api/payments/status/:order_id (Payment Status Check) ────────────────
router.get('/payments/status/:order_id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const orderId = parseInt(req.params.order_id, 10);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const orderRes = await pool.query(
      `SELECT id, order_number, status, payment_status, payment_method, total_amount, currency, updated_at
       FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    // Rule A11: Surface "M-Pesa" to the user, never the internal gateway name
    res.json({
      order_id: order.id,
      order_number: order.order_number,
      payment_method: 'M-Pesa',
      payment_status: order.payment_status,
      order_status: order.status,
      amount: order.total_amount,
      currency: order.currency,
      updated_at: order.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
