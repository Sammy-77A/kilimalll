/**
 * Extracts the product data embedded in the saved listing pages (public/listing/*.html)
 * and writes an idempotent SQL migration that imports them into the database.
 *
 * Usage:  node scripts/extract-listings.js
 * Output: server/db/migrations/004_import_saved_listings.sql
 *
 * Data sources inside each saved page:
 *   - schema.org JSON-LD  → name, sku, description, brand, price, images, rating, review count
 *   - markup              → original (strikethrough) price, category breadcrumb, variant options
 *
 * Not present in the pages, so NOT imported / placeholder:
 *   - stock levels      → every variant gets PLACEHOLDER_STOCK (adjust in the DB when known)
 *   - variant prices    → every variant uses the product price
 *   - seller name       → column default ("Kilimall Direct")
 *   - individual reviews (reviews.user_id is NOT NULL and the pages carry no user accounts)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LISTING_DIR = path.join(ROOT, 'public', 'listing');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUT = path.join(ROOT, 'server', 'db', 'migrations', '004_import_saved_listings.sql');
const OUT_RELABEL = path.join(ROOT, 'server', 'db', 'migrations', '005_label_imported_sku_specs.sql');
const PLACEHOLDER_STOCK = 50;

const localImages = fs.readdirSync(IMAGES_DIR).sort();

// ── helpers ──────────────────────────────────────────────────────────────────
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', times: '×', deg: '°',
  reg: '®', trade: '™', copy: '©', middot: '·', bull: '•',
};
const decodeEntities = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m));
const text = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const sql = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
// "Electronics & Appliances" -> "electronics-appliances" (matches the existing seed slug)
const slugify = (name) => name.toLowerCase().replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function resolveImage(url) {
  const hash = (url.match(/\/([0-9a-f]{32})\./) || [])[1];
  const local = hash && localImages.find((f) => f.startsWith(`${hash}.`));
  if (local) return { url: `/images/${local}`, local: true };
  return { url: url.replace(/#$/, ''), local: false };
}

function parseListing(file) {
  const html = fs.readFileSync(path.join(LISTING_DIR, file), 'utf8');
  const origId = (file.match(/^(\d+)/) || [])[1];

  const ldMatch = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
  if (!ldMatch) throw new Error(`${file}: no JSON-LD block`);
  const ld = JSON.parse(ldMatch[1]).mainEntity;

  const delPrice = (html.match(/class="del-price"[^>]*>\s*KSh\s*([\d,]+)\s*</) || [])[1];
  const price = Number(ld.offers.price);
  const originalPrice = delPrice ? Number(delPrice.replace(/,/g, '')) : null;

  // Category: Home > Top > Sub > ... (the API exposes a two-level tree, so keep Top + Sub).
  const body = html.slice(html.indexOf('<body'));
  const crumbStart = body.indexOf('class="breadcrumbs"');
  const crumbSeg = crumbStart >= 0 ? body.slice(crumbStart, crumbStart + 1800) : '';
  const crumbs = [...crumbSeg.matchAll(/<(?:span|div|a)[^>]*class="[^"]*(?:name|b-name)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|a)>/g)]
    .map((m) => text(m[1]));
  if (crumbs.length < 3) throw new Error(`${file}: breadcrumb not found (${crumbs.join(' > ')})`);

  // Variant groups, e.g. Color: [Black, Pink] / Size: [one size]
  const groups = [];
  const groupRe = /<div class="label info-item-spec"[^>]*>([\s\S]*?)<\/div><div class="value"[^>]*>([\s\S]*?)<\/div><\/div>(?=<div class="info-item|<!--\]-->)/g;
  for (const m of html.matchAll(groupRe)) {
    const label = text(m[1]).split(':')[0].trim();
    const options = [...m[2].matchAll(/<div class="sku-btn"[^>]*>([\s\S]*?)<\/div>(?=<span|<\/div>)/g)].map((o) => {
      const img = (o[1].match(/src="\.\.\/images\/([^"]+)"/) || [])[1];
      return { name: text(o[1]), image: img ? `/images/${img}` : null };
    });
    if (options.length) groups.push({ label, options });
  }

  const rating = ld.aggregateRating || {};
  return {
    origId,
    file,
    sku: `KM-${ld.sku}`,
    slug: `kl-${origId}`,
    name: text(ld.name),
    description: text(ld.description || ''),
    brand: ld.brand && ld.brand.name,
    price,
    originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
    topCategory: crumbs[1],
    subCategory: crumbs[2],
    images: (ld.image || []).map(resolveImage),
    groups,
    ratingScore: rating.ratingValue ? Number(rating.ratingValue) : 4.8,
    reviewCount: rating.reviewCount ? Number(rating.reviewCount) : 0,
  };
}

// One variant per combination of options. `name` is labelled ("Color: Black / Size: one size")
// so the product page can rebuild the option groups; `plainName` is the first-import format.
function crossProduct(groups) {
  return groups.reduce(
    (acc, g) => acc.flatMap((combo) => g.options.map((o) => ({
      name: combo.name ? `${combo.name} / ${g.label}: ${o.name}` : `${g.label}: ${o.name}`,
      plainName: combo.plainName ? `${combo.plainName} / ${o.name}` : o.name,
      image: combo.image || o.image,
    }))),
    [{ name: '', plainName: '', image: null }]
  ).filter((c) => c.name);
}

// ── build SQL ────────────────────────────────────────────────────────────────
const files = fs.readdirSync(LISTING_DIR).filter((f) => f.endsWith('.html')).sort();
const products = files.map(parseListing);

const skuSet = new Set();
for (const p of products) {
  if (skuSet.has(p.sku) || skuSet.has(p.slug)) throw new Error(`Duplicate sku/slug for ${p.file}`);
  skuSet.add(p.sku); skuSet.add(p.slug);
}

const topCats = new Map();   // slug -> name
const subCats = new Map();   // slug -> { name, parentSlug }
for (const p of products) {
  topCats.set(slugify(p.topCategory), p.topCategory);
  subCats.set(slugify(p.subCategory), { name: p.subCategory, parentSlug: slugify(p.topCategory) });
}

const out = [];
out.push(`-- Migration 004_import_saved_listings.sql
-- GENERATED by scripts/extract-listings.js from public/listing/*.html — do not edit by hand;
-- re-run the script instead. Idempotent: safe to run more than once (ON CONFLICT / NOT EXISTS).
--
-- Imports ${products.length} products captured in the saved Kilimall listing pages.
-- Product slug is "kl-<original Kilimall listing id>" so a saved page can be mapped to its row.
--
-- PLACEHOLDERS (the saved pages do not contain these):
--   * every variant has stock = ${PLACEHOLDER_STOCK}
--   * every variant price = the product price
--   * seller_name = column default
-- Images use local /images/... files when saved locally, otherwise the original kilimall.com image URL.
`);

out.push('-- Categories (top level, then second level); existing rows with the same slug are kept');
let order = 100;
for (const [slug, name] of topCats) {
  out.push(`INSERT INTO categories (name, slug, sort_order) VALUES (${sql(name)}, ${sql(slug)}, ${order++}) ON CONFLICT (slug) DO NOTHING;`);
}
order = 1;
for (const [slug, { name, parentSlug }] of subCats) {
  out.push(`INSERT INTO categories (name, slug, parent_id, sort_order)
  SELECT ${sql(name)}, ${sql(slug)}, id, ${order++} FROM categories WHERE slug = ${sql(parentSlug)}
  ON CONFLICT (slug) DO NOTHING;`);
}
out.push('');

for (const p of products) {
  out.push(`-- ${p.origId}: ${p.name.slice(0, 80)}`);
  out.push(`INSERT INTO products (sku, name, slug, description, price, original_price, category_id, main_image_url, rating_score, review_count, is_active)
VALUES (${sql(p.sku)}, ${sql(p.name)}, ${sql(p.slug)}, ${sql(p.description)}, ${p.price}, ${p.originalPrice === null ? 'NULL' : p.originalPrice},
  (SELECT id FROM categories WHERE slug = ${sql(slugify(p.subCategory))}),
  ${sql(p.images[0] ? p.images[0].url : null)}, ${p.ratingScore}, ${p.reviewCount}, true)
ON CONFLICT (slug) DO NOTHING;`);

  if (p.images.length) {
    const values = p.images.map((img, i) => `(${sql(img.url)}, ${i})`).join(', ');
    out.push(`INSERT INTO product_images (product_id, image_url, sort_order)
SELECT p.id, v.image_url, v.sort_order FROM products p, (VALUES ${values}) AS v(image_url, sort_order)
WHERE p.slug = ${sql(p.slug)} AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id);`);
  }

  const skus = crossProduct(p.groups);
  if (skus.length) {
    const values = skus.map((s, i) => `(${sql(`${p.sku}-${i + 1}`)}, ${sql(s.name)}, ${sql(s.image)})`).join(',\n  ');
    out.push(`INSERT INTO product_skus (product_id, sku_code, spec_name, price, stock, image_url)
SELECT p.id, v.sku_code, v.spec_name, ${p.price}, ${PLACEHOLDER_STOCK}, v.image_url FROM products p, (VALUES
  ${values}
) AS v(sku_code, spec_name, image_url)
WHERE p.slug = ${sql(p.slug)}
ON CONFLICT (sku_code) DO NOTHING;`);
  }
  out.push('');
}

fs.writeFileSync(OUT, out.join('\n'), 'utf8');

// 005: the first import stored unlabelled variant names ("Black / one size"). Databases that already
// ran that version are relabelled here; on a fresh database this matches no rows (004 is labelled).
const relabel = [`-- Migration 005_label_imported_sku_specs.sql
-- GENERATED by scripts/extract-listings.js. Relabels variant names imported by the first version of 004
-- ("Black / one size" -> "Color: Black / Size: one size"). Idempotent; a no-op on fresh databases.
`];
for (const p of products) {
  crossProduct(p.groups).forEach((s, i) => {
    relabel.push(`UPDATE product_skus SET spec_name = ${sql(s.name)} WHERE sku_code = ${sql(`${p.sku}-${i + 1}`)} AND spec_name = ${sql(s.plainName)};`);
  });
}
fs.writeFileSync(OUT_RELABEL, relabel.join('\n') + '\n', 'utf8');

// ── report ───────────────────────────────────────────────────────────────────
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
for (const p of products) {
  const local = p.images.filter((i) => i.local).length;
  console.log(`${p.slug.padEnd(16)} ${String(p.price).padStart(6)} (was ${p.originalPrice || '-'}) | ${p.topCategory} > ${p.subCategory} | images ${local}/${p.images.length} local | variants ${crossProduct(p.groups).length} | rating ${p.ratingScore} (${p.reviewCount})`);
}
