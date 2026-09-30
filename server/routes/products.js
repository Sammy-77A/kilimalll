const router = require('express').Router();
const pool = require('../db/pool');

/**
 * GET /api/categories
 * Returns tree of active product categories.
 */
router.get('/categories', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, icon_url, parent_id, sort_order
       FROM categories
       WHERE is_active = true
       ORDER BY sort_order ASC, name ASC`
    );

    const categories = result.rows;
    const topLevel = categories.filter((c) => c.parent_id === null);
    const categoryTree = topLevel.map((parent) => ({
      ...parent,
      subcategories: categories.filter((c) => c.parent_id === parent.id),
    }));

    res.json({ categories: categoryTree });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products
 * List products with pagination, filtering by category, price range, and sorting.
 */
router.get('/products', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { category_id, category_slug, min_price, max_price, sort } = req.query;

    const whereClauses = ['p.is_active = true'];
    const values = [];

    if (category_id) {
      values.push(parseInt(category_id, 10));
      whereClauses.push(`p.category_id = $${values.length}`);
    } else if (category_slug) {
      values.push(category_slug);
      whereClauses.push(`p.category_id IN (SELECT id FROM categories WHERE slug = $${values.length} OR parent_id = (SELECT id FROM categories WHERE slug = $${values.length}))`);
    }

    if (min_price) {
      values.push(parseFloat(min_price));
      whereClauses.push(`p.price >= $${values.length}`);
    }

    if (max_price) {
      values.push(parseFloat(max_price));
      whereClauses.push(`p.price <= $${values.length}`);
    }

    let orderBy = 'p.created_at DESC';
    if (sort === 'price_asc') orderBy = 'p.price ASC';
    else if (sort === 'price_desc') orderBy = 'p.price DESC';
    else if (sort === 'rating') orderBy = 'p.rating_score DESC';
    else if (sort === 'sales') orderBy = 'p.sales_count DESC';

    const whereSql = whereClauses.join(' AND ');

    const countQuery = `SELECT COUNT(*) FROM products p WHERE ${whereSql}`;
    const countRes = await pool.query(countQuery, values);
    const totalItems = parseInt(countRes.rows[0].count, 10);

    const queryValues = [...values, limit, offset];
    const dataQuery = `
      SELECT p.id, p.sku, p.name, p.slug, p.description, p.price, p.original_price,
             p.category_id, c.name AS category_name, p.main_image_url, p.seller_name,
             p.rating_score, p.review_count, p.sales_count, p.created_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`;

    const dataRes = await pool.query(dataQuery, queryValues);

    res.json({
      products: dataRes.rows,
      pagination: {
        total: totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id
 * Detailed product view including images, SKUs/variations, and active flash sale info.
 */
router.get('/products/:id', async (req, res, next) => {
  const param = req.params.id;
  const isNumeric = /^\d+$/.test(param);

  try {
    const productQuery = isNumeric
      ? 'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1 AND p.is_active = true'
      : 'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1 AND p.is_active = true';

    const productRes = await pool.query(productQuery, [param]);

    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Product not found' });
    }

    const product = productRes.rows[0];

    const [imagesRes, skusRes, flashRes] = await Promise.all([
      pool.query('SELECT id, image_url, sort_order FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC', [product.id]),
      pool.query('SELECT id, sku_code, spec_name, price, stock, image_url FROM product_skus WHERE product_id = $1 ORDER BY id ASC', [product.id]),
      pool.query('SELECT id, flash_price, stock_allocated, stock_sold, start_time, end_time FROM flash_sales WHERE product_id = $1 AND is_active = true AND start_time <= NOW() AND end_time >= NOW() LIMIT 1', [product.id]),
    ]);

    product.images = imagesRes.rows;
    product.skus = skusRes.rows;
    product.flash_sale = flashRes.rows[0] || null;

    res.json({ product });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/search?q=
 * Product search endpoint supporting full text matching & hot keywords update.
 */
router.get('/search', async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json({ products: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  try {
    // Increment search counter for matched search keywords
    pool.query('UPDATE search_keywords SET search_count = search_count + 1 WHERE LOWER(keyword) = LOWER($1)', [q]).catch(() => {});

    const searchPattern = `%${q}%`;

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM products p
       WHERE p.is_active = true AND (p.name ILIKE $1 OR p.description ILIKE $1 OR p.sku ILIKE $1)`,
      [searchPattern]
    );
    const totalItems = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(
      `SELECT p.id, p.sku, p.name, p.slug, p.description, p.price, p.original_price,
              p.category_id, c.name AS category_name, p.main_image_url, p.seller_name,
              p.rating_score, p.review_count, p.sales_count
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = true AND (p.name ILIKE $1 OR p.description ILIKE $1 OR p.sku ILIKE $1)
       ORDER BY p.sales_count DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [searchPattern, limit, offset]
    );

    res.json({
      query: q,
      products: dataRes.rows,
      pagination: {
        total: totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
