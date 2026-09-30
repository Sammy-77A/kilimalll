const router = require('express').Router();
const { z } = require('zod');
const pool = require('../db/pool');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

// ── Validation Schemas ───────────────────────────────────────────────────────
const addCartItemSchema = z.object({
  product_id: z.number().int().positive('Product ID must be a positive integer'),
  sku_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive().default(1),
});

const updateCartItemSchema = z.object({
  quantity: z.number().int().positive('Quantity must be at least 1'),
});

const mergeCartSchema = z.object({
  items: z.array(
    z.object({
      product_id: z.number().int().positive(),
      sku_id: z.number().int().positive().nullable().optional(),
      quantity: z.number().int().positive(),
    })
  ).min(1, 'Items array must not be empty'),
});

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * GET /api/cart
 * Fetch current authenticated user's cart with product and SKU details.
 */
router.get('/cart', authenticate, async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const sql = `
      SELECT ci.id, ci.product_id, ci.sku_id, ci.quantity, ci.created_at, ci.updated_at,
             p.name AS product_name, p.slug AS product_slug, p.price AS product_price,
             p.main_image_url, p.is_active AS product_is_active,
             ps.sku_code, ps.spec_name, ps.price AS sku_price, ps.stock AS sku_stock, ps.image_url AS sku_image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_skus ps ON ci.sku_id = ps.id
      WHERE ci.user_id = $1
      ORDER BY ci.updated_at DESC, ci.id DESC`;

    const result = await pool.query(sql, [userId]);

    let subtotal = 0;
    const items = result.rows.map((row) => {
      const unitPrice = parseFloat(row.sku_price || row.product_price);
      const itemTotal = unitPrice * row.quantity;
      subtotal += itemTotal;
      return {
        id: row.id,
        product_id: row.product_id,
        sku_id: row.sku_id,
        product_name: row.product_name,
        product_slug: row.product_slug,
        spec_name: row.spec_name || null,
        sku_code: row.sku_code || null,
        image_url: row.sku_image_url || row.main_image_url,
        unit_price: unitPrice,
        quantity: row.quantity,
        total_price: itemTotal,
        stock_available: row.sku_id ? row.sku_stock : 100,
        is_active: row.product_is_active,
      };
    });

    res.json({
      cart: {
        user_id: userId,
        items,
        item_count: items.reduce((acc, i) => acc + i.quantity, 0),
        subtotal: parseFloat(subtotal.toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cart/items
 * Add an item to the user's cart (or increment quantity if already exists).
 */
router.post('/cart/items', authenticate, validate(addCartItemSchema), async (req, res, next) => {
  const userId = req.user.userId;
  const { product_id, sku_id, quantity } = req.body;
  const targetSkuId = sku_id || null;

  try {
    // Verify product exists
    const prodRes = await pool.query('SELECT id, is_active FROM products WHERE id = $1', [product_id]);
    if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
      return res.status(404).json({ error: 'Not Found', message: 'Product not found or inactive' });
    }

    // Verify SKU if provided
    if (targetSkuId) {
      const skuRes = await pool.query('SELECT id, stock FROM product_skus WHERE id = $1 AND product_id = $2', [targetSkuId, product_id]);
      if (skuRes.rows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Product SKU variation not found' });
      }
    }

    const upsertSql = `
      INSERT INTO cart_items (user_id, product_id, sku_id, quantity, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, product_id, COALESCE(sku_id, -1)) DO UPDATE
      SET quantity = cart_items.quantity + EXCLUDED.quantity,
          updated_at = NOW()
      RETURNING id, user_id, product_id, sku_id, quantity, updated_at`;

    // Handle standard null conflict index
    const checkExisting = await pool.query(
      `SELECT id, quantity FROM cart_items
       WHERE user_id = $1 AND product_id = $2 AND (sku_id = $3 OR ($3 IS NULL AND sku_id IS NULL))`,
      [userId, product_id, targetSkuId]
    );

    let cartItem;
    if (checkExisting.rows.length > 0) {
      const existingId = checkExisting.rows[0].id;
      const newQty = checkExisting.rows[0].quantity + quantity;
      const updateRes = await pool.query(
        'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [newQty, existingId]
      );
      cartItem = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        'INSERT INTO cart_items (user_id, product_id, sku_id, quantity) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, product_id, targetSkuId, quantity]
      );
      cartItem = insertRes.rows[0];
    }

    res.status(201).json({ message: 'Item added to cart', item: cartItem });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cart/items/:id
 * Update quantity of a specific cart item.
 */
router.put('/cart/items/:id', authenticate, validate(updateCartItemSchema), async (req, res, next) => {
  const userId = req.user.userId;
  const itemId = parseInt(req.params.id, 10);
  const { quantity } = req.body;

  try {
    const result = await pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, itemId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Cart item not found' });
    }

    res.json({ message: 'Cart item updated', item: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/cart/items/:id
 * Remove a specific item from the cart.
 */
router.delete('/cart/items/:id', authenticate, async (req, res, next) => {
  const userId = req.user.userId;
  const itemId = parseInt(req.params.id, 10);

  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [itemId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Cart item not found' });
    }

    res.json({ message: 'Cart item removed', id: itemId });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cart/merge
 * Merge local guest cart items into authenticated user's cart on login.
 */
router.post('/cart/merge', authenticate, validate(mergeCartSchema), async (req, res, next) => {
  const userId = req.user.userId;
  const { items } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const targetSkuId = item.sku_id || null;
      const checkExisting = await client.query(
        `SELECT id, quantity FROM cart_items
         WHERE user_id = $1 AND product_id = $2 AND (sku_id = $3 OR ($3 IS NULL AND sku_id IS NULL))`,
        [userId, item.product_id, targetSkuId]
      );

      if (checkExisting.rows.length > 0) {
        await client.query(
          'UPDATE cart_items SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
          [item.quantity, checkExisting.rows[0].id]
        );
      } else {
        await client.query(
          'INSERT INTO cart_items (user_id, product_id, sku_id, quantity) VALUES ($1, $2, $3, $4)',
          [userId, item.product_id, targetSkuId, item.quantity]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Cart merged successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
