require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ── CORS ─────────────────────────────────────────────────────────────────────
// Restrict to our own domain in production; allow all origins in development.
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? [process.env.ALLOWED_ORIGIN || 'https://kilimalll.onrender.com']
  : true; // 'true' in cors() means reflect any origin (dev only)

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ── Security & Performance ────────────────────────────────────────────────────
// CSP remains off for now: the existing static HTML uses inline styles and
// inline scripts from Nuxt. It will be enabled with nonces in Phase 12.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());

// ── Logging ──────────────────────────────────────────────────────────────────
// Use 'dev' in development for concise coloured output; 'combined' in prod.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Service Worker & Fallback Asset Handlers ─────────────────────────────────
app.get('/sw.js', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'sw.js')));

app.use('/_nuxt', (_req, res) =>
  res.status(204).end());

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/cms'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/cart'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/payments'));

// Product detail pages (/product/:ref) and legacy /listing/<id> redirects — must precede static /listing
app.use(require('./routes/product-page'));

// ── Static Assets ─────────────────────────────────────────────────────────────
// kilimall-ui.js is actively updated and has no content-hash in its filename.
// Must be served with no-cache so every deploy takes effect immediately.
// All other /js files have hashed names so immutable caching is safe for them.
app.get('/js/kilimall-ui.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'js', 'kilimall-ui.js'));
});
app.use('/css',     express.static(path.join(PUBLIC_DIR, 'css'),     { maxAge: '30d', immutable: true }));
app.use('/js',      express.static(path.join(PUBLIC_DIR, 'js'),      { maxAge: '30d', immutable: true }));
app.use('/images',  express.static(path.join(PUBLIC_DIR, 'images'),  { maxAge: '30d' }));
app.use('/fonts',   express.static(path.join(PUBLIC_DIR, 'fonts'),   { maxAge: '365d', immutable: true }));
app.use('/assets',  express.static(path.join(PUBLIC_DIR, 'assets'),  { maxAge: '30d' }));

// ── Page Routes ───────────────────────────────────────────────────────────────
app.use('/listing',     express.static(path.join(PUBLIC_DIR, 'listing')));
app.use('/help-center', express.static(path.join(PUBLIC_DIR, 'help-center')));

app.get('/download', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'downloadApp.html')));
app.get('/sitemap', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'sitemap.html')));

// The saved pages use RELATIVE asset URLs (css/..., js/..., images/..., search.<id>.html,
// sitemap.html), so they only render correctly when served from the site root, at the
// same path they were saved under.
const ROOT_PAGES = new Set(['downloadApp.html', 'sitemap.html']);
app.get(/^\/(search\.[A-Za-z0-9]+\.html|downloadApp\.html|sitemap\.html)$/, (req, res, next) => {
  const name = req.params[0];
  if (!name.startsWith('search.') && !ROOT_PAGES.has(name)) return next();
  res.sendFile(path.join(PUBLIC_DIR, name), (err) => { if (err) next(); });
});

// Legacy form /search/<id>[.html][?q=...] redirects to the root page (query string preserved).
app.get('/search/:id', (req, res, next) => {
  const id = req.params.id.replace(/\.html$/, '');
  if (!/^[A-Za-z0-9]+$/.test(id)) return next();
  if (!fs.existsSync(path.join(PUBLIC_DIR, `search.${id}.html`))) return next();
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
  res.redirect(302, `/search.${id}.html${query}`);
});

// ── SPA Catch-All ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Kilimall server running on port ${PORT}`);
    console.log(`   ENV:     ${process.env.NODE_ENV || 'development'}`);
    console.log(`   DB:      ${process.env.DATABASE_URL ? 'configured' : '⚠️  DATABASE_URL not set'}`);
    console.log(`   CORS:    ${process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGIN : 'all origins (dev)'}`);
  });
}

// Export app for testing (supertest can import without starting the HTTP server)
module.exports = app;
