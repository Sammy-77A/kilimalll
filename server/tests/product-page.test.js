import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const app = require('../index.js');
const productPage = require('../routes/product-page');

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const LISTING_DIR = path.join(PUBLIC, 'listing');

// Reads price/name/image-count straight from a saved listing page's JSON-LD block.
function savedListing(file) {
  const html = fs.readFileSync(path.join(LISTING_DIR, file), 'utf8');
  const ld = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]).mainEntity;
  return { origId: file.match(/^(\d+)/)[1], price: Number(ld.offers.price), imageCount: ld.image.length };
}

function injectedData(html) {
  const match = html.match(/window\.__KM_PRODUCT__=(\{[\s\S]*?\});<\/script>/);
  expect(match, 'window.__KM_PRODUCT__ present').toBeTruthy();
  return JSON.parse(match[1]);
}

describe('Product detail page (/product/:ref)', () => {
  let product; // API view of the imported Tecno phone (listing 10006105583)

  beforeAll(async () => {
    const res = await request(app).get('/api/products/kl-10006105583');
    expect(res.status).toBe(200);
    product = res.body.product;
  });

  it('serves the template with the product data injected and the UI script included', async () => {
    const res = await request(app).get(`/product/${product.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('/js/kilimall-ui.js');
    expect(res.text).toContain('id="km-hide"'); // page stays hidden until filled
    expect(res.text).toContain(`<title>${product.name.replace(/"/g, '&quot;')} | Kilimall Kenya</title>`);

    const data = injectedData(res.text);
    expect(data.product.id).toBe(product.id);
    expect(data.product.sku).toBe('KM-1001912868');
    expect(data.product.price).toBe(17999);
    expect(data.product.original_price).toBe(19999);
    expect(data.product.images.length).toBe(7);
    expect(data.product.skus.length).toBe(5);
    expect(data.product.skus[0].spec_name).toBe('Color: Ink Black / Storage: 128GB+8(4+4)GB');
    expect(data.breadcrumbs).toEqual(['Phones & Accessories', 'Mobile Phones']);
  });

  it('accepts a slug as well as an id', async () => {
    const res = await request(app).get('/product/kl-10006105583');
    expect(res.status).toBe(200);
    expect(injectedData(res.text).product.id).toBe(product.id);
  });

  it('never leaks the template product or vendor name', async () => {
    // A different product must not still show the template's (Tecno) name in the injected data.
    const other = (await request(app).get('/api/products/kl-18104433')).body.product;
    const res = await request(app).get(`/product/${other.id}`);
    expect(injectedData(res.text).product.name).toBe(other.name);
    expect(res.text.toLowerCase()).not.toContain('payhero');
  });

  it('returns 404 (with the homepage markup) for an unknown product', async () => {
    const res = await request(app).get('/product/99999999');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('__KM_PRODUCT__');
  });

  it('ignores malformed references instead of querying the database', async () => {
    const res = await request(app).get('/product/a%20b%3Bdrop');
    expect(res.text).not.toContain('__KM_PRODUCT__');
  });

  it('escapes data placed inside the inline script', () => {
    const out = productPage.safeJson({ a: '</script><script>alert(1)</script>', b: '<!--', c: String.fromCharCode(0x2028) });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(out).a).toBe('</script><script>alert(1)</script>');
  });
});

describe('Legacy /listing/<file> URLs', () => {
  it('redirect to /product/<id> for every imported saved listing', async () => {
    const files = fs.readdirSync(LISTING_DIR).filter((f) => f.endsWith('.html'));
    expect(files.length).toBe(9);
    for (const file of files) {
      const { origId } = savedListing(file);
      const api = await request(app).get(`/api/products/kl-${origId}`);
      expect(api.status, `product kl-${origId} imported`).toBe(200);
      const res = await request(app).get(`/listing/${file}`).redirects(0);
      expect(res.status, file).toBe(302);
      expect(res.headers.location).toBe(`/product/${api.body.product.id}`);
    }
  });

  it('fall through (no redirect) for listings that were never imported', async () => {
    const res = await request(app).get('/listing/99999999999-Not-A-Real-Product.html').redirects(0);
    expect(res.status).not.toBe(302);
  });
});

describe('Imported saved listings match the saved pages', () => {
  it('each product has the saved page price, its images, and a category', async () => {
    const files = fs.readdirSync(LISTING_DIR).filter((f) => f.endsWith('.html'));
    for (const file of files) {
      const saved = savedListing(file);
      const res = await request(app).get(`/api/products/kl-${saved.origId}`);
      expect(res.status).toBe(200);
      const p = res.body.product;
      expect(parseFloat(p.price), `${file} price`).toBe(saved.price);
      expect(p.images.length, `${file} images`).toBe(saved.imageCount);
      expect(p.category_name, `${file} category`).toBeTruthy();
      expect(p.skus.length, `${file} variants`).toBeGreaterThan(0);
      for (const sku of p.skus) expect(sku.spec_name).toMatch(/: /); // labelled "Color: ..."
    }
  });

  it('local image paths in the database all exist on disk', async () => {
    const files = fs.readdirSync(LISTING_DIR).filter((f) => f.endsWith('.html'));
    for (const file of files) {
      const { origId } = savedListing(file);
      const p = (await request(app).get(`/api/products/kl-${origId}`)).body.product;
      for (const img of p.images) {
        if (img.image_url.startsWith('/images/')) {
          expect(fs.existsSync(path.join(PUBLIC, img.image_url)), img.image_url).toBe(true);
        } else {
          expect(img.image_url).toMatch(/^https:\/\/(img|image)\.kilimall\.com\//);
        }
      }
    }
  });

  it('imported products appear in search and category listings', async () => {
    const search = await request(app).get('/api/search?q=TECNO');
    expect(search.status).toBe(200);
    expect(search.body.products.some((p) => p.slug === 'kl-10006105583')).toBe(true);

    const category = await request(app).get('/api/products?category_slug=phones-accessories');
    expect(category.status).toBe(200);
    expect(category.body.products.some((p) => p.slug === 'kl-10006105583')).toBe(true);
  });
});
