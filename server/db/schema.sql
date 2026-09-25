-- Kilimall Database Schema
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  sku            VARCHAR(50) UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE NOT NULL,
  description    TEXT,
  price          NUMERIC(12,2) NOT NULL,
  original_price NUMERIC(12,2),
  category       VARCHAR(100),
  image_url      TEXT,
  stock          INTEGER DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  parent_id  INTEGER REFERENCES categories(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  name          VARCHAR(255),
  password_hash TEXT,
  region        VARCHAR(5) DEFAULT 'KE',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  status     VARCHAR(50) DEFAULT 'pending',
  total      NUMERIC(12,2) NOT NULL,
  region     VARCHAR(5) DEFAULT 'KE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity   INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
