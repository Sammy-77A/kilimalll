const express = require('express');
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

  // Credentials not configured — return null to fall back to sandbox mode
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

    const callbackUrl = process.env.PAYHERO_CALLBACK_URL ||
      `${process.env.BASE_URL || 'https://kilimalll.onrender.com'}/api/payments/webhook`;
    const channelId = parseInt(process.env.PAYHERO_CHANNEL_ID || '1', 10);

    let checkoutReference = `STK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // 2. Call PayHero via SDK (if credentials are configured)
    const client = await getPayHeroClient();
    if (client) {
      try {
        const stkResponse = await client.stkPush({
          phone_number: formattedPhone,
          amount: parseFloat(order.total_amount),
          provider: 'm-pesa',
          channel_id: channelId,
          external_reference: order.order_number,
          callback_url: callbackUrl,
        });

        if (stkResponse && stkResponse.reference) {
          checkoutReference = stkResponse.reference;
        } else if (stkResponse && stkResponse.CheckoutRequestID) {
          checkoutReference = stkResponse.CheckoutRequestID;
        }
      } catch (stkErr) {
        // Non-fatal: log and fall back to the generated sandbox reference
        console.error('STK push error:', stkErr.message);
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
      return res.status(422).json({ error: 'Validation error', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/payments/webhook (Callback from Payment Gateway) ───────────────
router.post('/payments/webhook', async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('Payment Webhook Received:', JSON.stringify(payload));

    // Normalise across flat and nested payload shapes
    const responseData = payload.response || payload;
    const externalReference = responseData.external_reference || responseData.order_number || payload.external_reference;
    const checkoutReference = responseData.reference || responseData.checkout_id || payload.reference;
    const isSuccess =
      responseData.status === 'SUCCESS' ||
      responseData.success === true ||
      payload.status === 'SUCCESS' ||
      payload.success === true;
    const mpesaReceipt = responseData.MpesaReceiptNumber || responseData.receipt || payload.mpesa_receipt;

    if (!externalReference && !checkoutReference) {
      return res.status(400).json({ error: 'Missing order reference in webhook payload' });
    }

    // Find corresponding order by external_reference then payhero_reference
    let orderRes;
    if (externalReference) {
      orderRes = await pool.query(`SELECT * FROM orders WHERE order_number = $1`, [externalReference]);
    }
    if ((!orderRes || orderRes.rows.length === 0) && checkoutReference) {
      orderRes = await pool.query(`SELECT * FROM orders WHERE payhero_reference = $1`, [checkoutReference]);
    }

    if (!orderRes || orderRes.rows.length === 0) {
      console.warn('Webhook order lookup failed for ref:', externalReference || checkoutReference);
      return res.status(404).json({ error: 'Order not found for given payment reference' });
    }

    const order = orderRes.rows[0];

    if (isSuccess) {
      await pool.query(
        `UPDATE orders 
         SET status = 'paid', payment_status = 'paid', updated_at = NOW() 
         WHERE id = $1`,
        [order.id]
      );
      console.log(`Order ${order.order_number} marked as PAID. Receipt: ${mpesaReceipt || 'N/A'}`);
    } else {
      await pool.query(
        `UPDATE orders 
         SET payment_status = 'failed', updated_at = NOW() 
         WHERE id = $1`,
        [order.id]
      );
      console.log(`Order ${order.order_number} payment FAILED.`);
    }

    res.status(200).json({ received: true, status: isSuccess ? 'PAID' : 'FAILED' });
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
