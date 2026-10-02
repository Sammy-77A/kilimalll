/**
 * Product detail page.
 *
 *   GET /product/:ref      ref = product id or slug. Serves one saved listing page as a TEMPLATE
 *                          (no new UI: same markup/CSS as the original) with this product's data
 *                          injected as window.__KM_PRODUCT__; public/js/kilimall-ui.js fills the page.
 *   GET /listing/<file>    legacy saved-page URLs (listing/<original id>[-slug].html) redirect to
 *                          /product/<id> when that listing was imported (slug "kl-<original id>").
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

const router = express.Router();

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
// Richest saved page (two variant groups) — used as the markup template for every product.
const TEMPLATE_FILE = path.join(PUBLIC_DIR, 'listing', '10006105583.html');

let templateCache = null;
function getTemplate() {
  if (templateCache) return templateCache;
  let html = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  // Hide the page until the product data is filled in, so the template's own product never flashes.
  // A failsafe timer reveals the page even if the script fails to run.
  html = html.replace('</head>',
    '<style id="km-hide">html{visibility:hidden}</style>' +
    '<script>setTimeout(function(){var s=document.getElementById("km-hide");if(s)s.remove()},4000)</script></head>');
  html = html.replace('</body>', '__KM_DATA__<script src="/js/kilimall-ui.js" defer></script></body>');
  templateCache = html;
  return html;
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON that is safe inside an inline <script>: no </script>, no HTML comment openers, no line separators.
const LINE_SEPARATORS = new RegExp(String.fromCharCode(91, 0x2028, 0x2029, 93), 'g');
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATORS, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

async function loadProduct(ref) {
  const isNumeric = /^\d+$/.test(ref);
  const productRes = await pool.query(
    `SELECT p.id, p.slug, p.sku, p.name, p.description, p.price, p.original_price, p.main_image_url,
            p.seller_name, p.rating_score, p.review_count, p.category_id
     FROM products p WHERE ${isNumeric ? 'p.id' : 'p.slug'} = $1 AND p.is_active = true`,
    [isNumeric ? parseInt(ref, 10) : ref]
  );
  if (productRes.rows.length === 0) return null;
  const product = productRes.rows[0];

  const [imagesRes, skusRes, categoryRes] = await Promise.all([
    pool.query('SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, id ASC', [product.id]),
    pool.query('SELECT id, sku_code, spec_name, price, stock, image_url FROM product_skus WHERE product_id = $1 ORDER BY id ASC', [product.id]),
    pool.query(
      `SELECT c.name, parent.name AS parent_name FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id WHERE c.id = $1`,
      [product.category_id]
    ),
  ]);

  const category = categoryRes.rows[0];
  return {
    product: {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      original_price: product.original_price === null ? null : parseFloat(product.original_price),
      main_image_url: product.main_image_url,
      seller_name: product.seller_name,
      rating_score: parseFloat(product.rating_score),
      review_count: product.review_count,
      images: imagesRes.rows.map((r) => r.image_url),
      skus: skusRes.rows.map((s) => ({
        id: s.id, sku_code: s.sku_code, spec_name: s.spec_name, price: parseFloat(s.price), stock: s.stock, image_url: s.image_url,
      })),
    },
    breadcrumbs: category ? [category.parent_name, category.name].filter(Boolean) : [],
  };
}

router.get('/product/:ref', async (req, res, next) => {
  const ref = req.params.ref;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(ref)) return next();
  try {
    const data = await loadProduct(ref);
    if (!data) {
      return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
    }
    const html = getTemplate()
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(data.product.name)} | Kilimall Kenya</title>`)
      .replace('__KM_DATA__', () => `<script>window.__KM_PRODUCT__=${safeJson(data)};</script>`);
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
});

router.get('/listing/:file', async (req, res, next) => {
  const match = req.params.file.match(/^(\d+)(?:-[^/]*)?\.html$/);
  if (!match) return next();
  try {
    const found = await pool.query('SELECT id FROM products WHERE slug = $1 AND is_active = true', [`kl-${match[1]}`]);
    if (found.rows.length === 0) return next();
    res.redirect(302, `/product/${found.rows[0].id}`);
  } catch (_err) {
    next(); // fall back to the saved static page
  }
});

router.safeJson = safeJson;
module.exports = router;
