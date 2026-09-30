require('dotenv').config();
const express = require('express');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
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

// ── Logging ──────────────────────────────────────────────────────────────────
// Use 'dev' in development for concise coloured output; 'combined' in prod.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/cms'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/cart'));
app.use('/api', require('./routes/orders'));
// Future route mounts added here as phases complete:
// app.use('/api/payments', require('./routes/payments'));

// ── Static Assets (content-addressed — cache aggressively) ───────────────────
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

app.get('/search/:id', (req, res, next) => {
  const file = path.join(PUBLIC_DIR, `search.${req.params.id}.html`);
  res.sendFile(file, (err) => { if (err) next(); });
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
