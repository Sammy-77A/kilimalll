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

// Security & performance middleware
app.use(helmet({ contentSecurityPolicy: false })); // CSP off: Kilimall uses inline styles
app.use(compression());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', require('./routes/health'));

// Static assets — content-addressed files, cache aggressively
app.use('/css',     express.static(path.join(PUBLIC_DIR, 'css'),     { maxAge: '30d' }));
app.use('/js',      express.static(path.join(PUBLIC_DIR, 'js'),      { maxAge: '30d' }));
app.use('/images',  express.static(path.join(PUBLIC_DIR, 'images'),  { maxAge: '30d' }));
app.use('/fonts',   express.static(path.join(PUBLIC_DIR, 'fonts'),   { maxAge: '365d' }));
app.use('/assets',  express.static(path.join(PUBLIC_DIR, 'assets'),  { maxAge: '30d' }));

// Serve page routes
app.use('/listing',     express.static(path.join(PUBLIC_DIR, 'listing')));
app.use('/help-center', express.static(path.join(PUBLIC_DIR, 'help-center')));

// Named page routes
app.get('/download', (req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'downloadApp.html')));
app.get('/sitemap', (req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'sitemap.html')));

// Search pages (pattern: /search/XXXXXX)
app.get('/search/:id', (req, res, next) => {
  const file = path.join(PUBLIC_DIR, `search.${req.params.id}.html`);
  res.sendFile(file, (err) => { if (err) next(); });
});

// SPA catch-all — serve index.html for all unmatched routes
app.get('*', (req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Kilimall server running on port ${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB:  ${process.env.DATABASE_URL ? 'configured' : '⚠️ DATABASE_URL not set'}`);
});
