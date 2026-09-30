-- Migration 002_schema.sql
-- Phase 2 Database Schema for Kilimall System Reconstruction

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  name          VARCHAR(255),
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name VARCHAR(255) NOT NULL,
  phone          VARCHAR(20) NOT NULL,
  county         VARCHAR(100) NOT NULL,
  subcounty      VARCHAR(100) NOT NULL,
  area           VARCHAR(100) NOT NULL,
  street_address TEXT NOT NULL,
  is_default     BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Categories table
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  icon_url   TEXT,
  parent_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Products table
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  sku            VARCHAR(100) UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE NOT NULL,
  description    TEXT,
  price          NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  original_price NUMERIC(12,2) CHECK (original_price >= 0),
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  main_image_url TEXT,
  seller_name    VARCHAR(255) DEFAULT 'Kilimall Direct',
  rating_score   NUMERIC(3,2) DEFAULT 4.80 CHECK (rating_score >= 0 AND rating_score <= 5.00),
  review_count   INTEGER DEFAULT 0 CHECK (review_count >= 0),
  sales_count    INTEGER DEFAULT 0 CHECK (sales_count >= 0),
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Product Images table
CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Product SKUs / Variations table
CREATE TABLE IF NOT EXISTS product_skus (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku_code   VARCHAR(100) UNIQUE NOT NULL,
  spec_name  VARCHAR(255),
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Flash Sales table
CREATE TABLE IF NOT EXISTS flash_sales (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku_id          INTEGER REFERENCES product_skus(id) ON DELETE CASCADE,
  flash_price     NUMERIC(12,2) NOT NULL CHECK (flash_price >= 0),
  stock_allocated INTEGER NOT NULL DEFAULT 100,
  stock_sold      INTEGER NOT NULL DEFAULT 0,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Banners table
CREATE TABLE IF NOT EXISTS banners (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  image_url   TEXT NOT NULL,
  target_url  TEXT NOT NULL,
  banner_type VARCHAR(50) DEFAULT 'home_top' CHECK (banner_type IN ('home_top', 'home_small', 'category', 'popup')),
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  start_time  TIMESTAMPTZ,
  end_time    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Search Keywords table
CREATE TABLE IF NOT EXISTS search_keywords (
  id           SERIAL PRIMARY KEY,
  keyword      VARCHAR(100) UNIQUE NOT NULL,
  target_url   TEXT,
  is_hot       BOOLEAN DEFAULT false,
  search_count INTEGER DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Cart Items table
CREATE TABLE IF NOT EXISTS cart_items (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku_id     INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_product_sku UNIQUE(user_id, product_id, sku_id)
);

-- 11. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id                   SERIAL PRIMARY KEY,
  order_number         VARCHAR(60) UNIQUE NOT NULL,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  address_id           INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
  status               VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_method       VARCHAR(50) DEFAULT 'M-Pesa',
  payment_status       VARCHAR(50) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
  subtotal             NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  shipping_fee         NUMERIC(12,2) DEFAULT 0.00 CHECK (shipping_fee >= 0),
  discount_amount      NUMERIC(12,2) DEFAULT 0.00 CHECK (discount_amount >= 0),
  total_amount         NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency             VARCHAR(3) DEFAULT 'KES',
  payhero_checkout_url TEXT,
  payhero_reference    VARCHAR(100),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Order Items table
CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku_id       INTEGER REFERENCES product_skus(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  spec_name    VARCHAR(255),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price  NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id                   SERIAL PRIMARY KEY,
  product_id           INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id             INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  rating               INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment              TEXT,
  reviewer_name        VARCHAR(255) DEFAULT 'Anonymous',
  is_verified_purchase BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_product_skus_product_id ON product_skus(product_id);
CREATE INDEX IF NOT EXISTS idx_flash_sales_active ON flash_sales(is_active, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_banners_type_active ON banners(banner_type, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
