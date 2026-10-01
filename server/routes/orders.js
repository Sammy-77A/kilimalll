const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { z } = require('zod');

// ── Zod Schemas ───────────────────────────────────────────────────────────────
const createOrderSchema = z.object({
  address_id: z.number().int().positive().optional(),
  shipping_address: z.object({
    recipient_name: z.string().min(1),
    phone: z.string().min(1),
    county: z.string().min(1),
    subcounty: z.string().min(1),
    area: z.string().min(1),
    street_address: z.string().min(1),
  }).optional(),
  payment_method: z.string().default('M-Pesa'),
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    sku_id: z.number().int().positive().nullable().optional(),
    quantity: z.number().int().positive(),
  })).optional(),
});

// ── POST /api/orders (Create Order) ─────────────────────────────────────────
router.post('/orders', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const validated = createOrderSchema.parse(req.body);
    const userId = req.user.userId;

    // 1. Resolve Shipping Address ID
    let addressId = validated.address_id || null;
    if (!addressId && validated.shipping_address) {
      const addrRes = await client.query(
        `INSERT INTO addresses (user_id, recipient_name, phone, county, subcounty, area, street_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          userId,
          validated.shipping_address.recipient_name,
          validated.shipping_address.phone,
          validated.shipping_address.county,
          validated.shipping_address.subcounty,
          validated.shipping_address.area,
          validated.shipping_address.street_address,
        ]
      );
      addressId = addrRes.rows[0].id;
    }

    await client.query('BEGIN');

    // 2. Gather Items (from Body or Cart)
    let rawItems = [];
    let isCartCheckout = false;

    if (validated.items && validated.items.length > 0) {
      rawItems = validated.items;
    } else {
      // Fetch user's cart items
      isCartCheckout = true;
      const cartRes = await client.query(
        `SELECT product_id, sku_id, quantity FROM cart_items WHERE user_id = $1`,
        [userId]
      );
      if (cartRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cart is empty' });
      }
      rawItems = cartRes.rows;
    }

    // 3. Process each item: verify product/SKU existence, pricing, & stock
    const processedItems = [];
    let subtotal = 0;

    for (const item of rawItems) {
      // Check product
      const prodRes = await client.query(
        `SELECT id, name, price, main_image_url, is_active FROM products WHERE id = $1`,
        [item.product_id]
      );
      if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product ID ${item.product_id} is unavailable` });
      }
      const product = prodRes.rows[0];
      let unitPrice = parseFloat(product.price);
      let specName = null;

      // Check SKU if provided
      if (item.sku_id) {
        const skuRes = await client.query(
          `SELECT id, spec_name, price, stock FROM product_skus WHERE id = $1 AND product_id = $2`,
          [item.sku_id, item.product_id]
        );
        if (skuRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Invalid SKU ID ${item.sku_id} for product ${product.name}` });
        }
        const sku = skuRes.rows[0];
        if (sku.stock < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Insufficient stock for ${product.name} (${sku.spec_name}). Requested: ${item.quantity}, Available: ${sku.stock}`
          });
        }
        unitPrice = parseFloat(sku.price);
        specName = sku.spec_name;

        // Decrement SKU stock atomically
        const decRes = await client.query(
          `UPDATE product_skus SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
          [item.quantity, item.sku_id]
        );
        if (decRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Stock updated during checkout for ${product.name}. Please try again.` });
        }
      }

      // Update product sales_count
      await client.query(
        `UPDATE products SET sales_count = sales_count + $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );

      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      processedItems.push({
        product_id: item.product_id,
        sku_id: item.sku_id || null,
        product_name: product.name,
        spec_name: specName,
        quantity: item.quantity,
        unit_price: unitPrice.toFixed(2),
        total_price: totalPrice.toFixed(2),
      });
    }

    // 4. Calculate Order Financials
    const shippingFee = subtotal >= 5000 ? 0.00 : 150.00;
    const discountAmount = 0.00;
    const totalAmount = subtotal + shippingFee - discountAmount;
    const orderNumber = `KLM${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Insert Order Header
    const orderRes = await client.query(
      `INSERT INTO orders (
        order_number, user_id, address_id, status, payment_method, payment_status,
        subtotal, shipping_fee, discount_amount, total_amount, currency
      ) VALUES ($1, $2, $3, 'pending', $4, 'unpaid', $5, $6, $7, $8, 'KES')
      RETURNING *`,
      [
        orderNumber,
        userId,
        addressId,
        validated.payment_method || 'M-Pesa',
        subtotal.toFixed(2),
        shippingFee.toFixed(2),
        discountAmount.toFixed(2),
        totalAmount.toFixed(2),
      ]
    );
    const order = orderRes.rows[0];

    // 6. Insert Order Items
    const insertedItems = [];
    for (const item of processedItems) {
      const itemRes = await client.query(
        `INSERT INTO order_items (
          order_id, product_id, sku_id, product_name, spec_name, quantity, unit_price, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          order.id,
          item.product_id,
          item.sku_id,
          item.product_name,
          item.spec_name,
          item.quantity,
          item.unit_price,
          item.total_price,
        ]
      );
      insertedItems.push(itemRes.rows[0]);
    }

    // 7. Clear Cart if Cart Checkout
    if (isCartCheckout) {
      await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        ...order,
        items: insertedItems,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: 'Validation error', details: err.issues });
    }
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/orders (List User Orders) ───────────────────────────────────────
router.get('/orders', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status;

    let countQuery = `SELECT COUNT(*) FROM orders WHERE user_id = $1`;
    let countParams = [userId];
    let query = `SELECT * FROM orders WHERE user_id = $1`;
    let queryParams = [userId];

    if (statusFilter) {
      countQuery += ` AND status = $2`;
      countParams.push(statusFilter);
      query += ` AND status = $2`;
      queryParams.push(statusFilter);
    }

    query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].count, 10);
    const ordersRes = await pool.query(query, queryParams);

    // Attach items to each order
    const ordersWithItems = await Promise.all(
      ordersRes.rows.map(async (order) => {
        const itemsRes = await pool.query(
          `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
          [order.id]
        );
        return {
          ...order,
          items: itemsRes.rows,
        };
      })
    );

    res.json({
      orders: ordersWithItems,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/orders/:id (Fetch Single Order Details) ─────────────────────────
router.get('/orders/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const identifier = req.params.id;

    let orderRes;
    if (/^\d+$/.test(identifier)) {
      orderRes = await pool.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
        [parseInt(identifier, 10), userId]
      );
    } else {
      orderRes = await pool.query(
        `SELECT * FROM orders WHERE order_number = $1 AND user_id = $2`,
        [identifier, userId]
      );
    }

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    // Fetch items
    const itemsRes = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
      [order.id]
    );

    // Fetch address if present
    let address = null;
    if (order.address_id) {
      const addrRes = await pool.query(`SELECT * FROM addresses WHERE id = $1`, [order.address_id]);
      if (addrRes.rows.length > 0) {
        address = addrRes.rows[0];
      }
    }

    res.json({
      order: {
        ...order,
        items: itemsRes.rows,
        shipping_address: address,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/orders/:id/cancel (Cancel Pending Order) ─────────────────────
router.patch('/orders/:id/cancel', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId;
    const orderId = parseInt(req.params.id, 10);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    await client.query('BEGIN');

    // 1. Fetch Order
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    if (!['pending', 'processing'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Order cannot be cancelled. Current status is '${order.status}'`
      });
    }

    // 2. Restore SKU Stock
    const itemsRes = await client.query(
      `SELECT sku_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );

    for (const item of itemsRes.rows) {
      if (item.sku_id) {
        await client.query(
          `UPDATE product_skus SET stock = stock + $1 WHERE id = $2`,
          [item.quantity, item.sku_id]
        );
      }
    }

    // 3. Update Order Status
    const updateRes = await client.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Order cancelled successfully',
      order: updateRes.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
