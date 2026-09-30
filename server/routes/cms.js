const router = require('express').Router();
const pool = require('../db/pool');

/**
 * GET /api/banners
 * Returns active promotional banners ordered by sort_order.
 * Supports optional filtering by `type` (e.g. ?type=home_top).
 */
router.get('/banners', async (req, res, next) => {
  const { type } = req.query;
  try {
    const whereClauses = ['is_active = true'];
    const values = [];

    if (type) {
      values.push(type);
      whereClauses.push(`banner_type = $${values.length}`);
    }

    whereClauses.push('(start_time IS NULL OR start_time <= NOW())');
    whereClauses.push('(end_time IS NULL OR end_time >= NOW())');

    const sql = `
      SELECT id, title, image_url, target_url, banner_type, sort_order
      FROM banners
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY sort_order ASC, id ASC`;

    const result = await pool.query(sql, values);
    res.json({ banners: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/flash-sales
 * Returns currently active flash sale deals with product details.
 */
router.get('/flash-sales', async (_req, res, next) => {
  try {
    const sql = `
      SELECT fs.id, fs.product_id, fs.sku_id, fs.flash_price, fs.stock_allocated, fs.stock_sold,
             fs.start_time, fs.end_time,
             p.name AS product_name, p.slug AS product_slug, p.price AS original_price,
             p.main_image_url, p.rating_score, p.review_count,
             ps.spec_name
      FROM flash_sales fs
      JOIN products p ON fs.product_id = p.id
      LEFT JOIN product_skus ps ON fs.sku_id = ps.id
      WHERE fs.is_active = true
        AND fs.start_time <= NOW()
        AND fs.end_time >= NOW()
        AND p.is_active = true
      ORDER BY fs.end_time ASC, fs.id ASC`;

    const result = await pool.query(sql);
    res.json({ flash_sales: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/search-keywords/hot
 * Returns top hot search keywords for search bar suggestions.
 */
router.get('/search-keywords/hot', async (req, res, next) => {
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
  try {
    const sql = `
      SELECT id, keyword, target_url, is_hot, search_count, sort_order
      FROM search_keywords
      WHERE is_hot = true
      ORDER BY sort_order ASC, search_count DESC
      LIMIT $1`;

    const result = await pool.query(sql, [limit]);
    res.json({ keywords: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/featured
 * Returns featured homepage products (top rated / best sellers).
 */
router.get('/products/featured', async (req, res, next) => {
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
  try {
    const sql = `
      SELECT p.id, p.sku, p.name, p.slug, p.description, p.price, p.original_price,
             p.category_id, c.name AS category_name, p.main_image_url, p.seller_name,
             p.rating_score, p.review_count, p.sales_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = true
      ORDER BY p.sales_count DESC, p.rating_score DESC
      LIMIT $1`;

    const result = await pool.query(sql, [limit]);
    res.json({ products: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
