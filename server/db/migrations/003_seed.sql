-- Migration 003_seed.sql
-- Seed Data for Kilimall System Reconstruction Phase 2 (Kenya Scope)

-- 1. Users
INSERT INTO users (email, phone, name, password_hash, role) VALUES
  ('customer@kilimall.ke', '+254712345678', 'Juma Omondi', '$2b$10$e8wY01Q1/gQJ7v9rM9hZ4.1/8K4S.5D9wJ.y4gq3H.Q2Z1X0Y9Z8W', 'customer'),
  ('seller@kilimall.ke', '+254722987654', 'Nairobi Electronics Store', '$2b$10$e8wY01Q1/gQJ7v9rM9hZ4.1/8K4S.5D9wJ.y4gq3H.Q2Z1X0Y9Z8W', 'seller'),
  ('admin@kilimall.ke', '+254700000000', 'Kilimall Admin', '$2b$10$e8wY01Q1/gQJ7v9rM9hZ4.1/8K4S.5D9wJ.y4gq3H.Q2Z1X0Y9Z8W', 'admin')
ON CONFLICT (email) DO NOTHING;

-- 2. Customer Addresses
INSERT INTO addresses (user_id, recipient_name, phone, county, subcounty, area, street_address, is_default) VALUES
  (1, 'Juma Omondi', '+254712345678', 'Nairobi', 'Westlands', 'Kilimani', 'Argwings Kodhek Rd, Apt 4B', true),
  (1, 'Juma Omondi', '+254712345678', 'Mombasa', 'Nyali', 'Links Road', 'Beach Plaza, 2nd Floor', false)
ON CONFLICT DO NOTHING;

-- 3. Categories (Top Level & Subcategories)
INSERT INTO categories (id, name, slug, icon_url, parent_id, sort_order) VALUES
  (1, 'Phones & Tablets', 'phones-tablets', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=100&auto=format&fit=crop', NULL, 10),
  (2, 'Electronics & Appliances', 'electronics-appliances', 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=100&auto=format&fit=crop', NULL, 20),
  (3, 'Home & Living', 'home-living', 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=100&auto=format&fit=crop', NULL, 30),
  (4, 'Fashion & Beauty', 'fashion-beauty', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=100&auto=format&fit=crop', NULL, 40),
  (5, 'Smartphones', 'smartphones', 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=100&auto=format&fit=crop', 1, 1),
  (6, 'Audio & Accessories', 'audio-accessories', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&auto=format&fit=crop', 2, 1),
  (7, 'Smart TVs', 'smart-tvs', 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=100&auto=format&fit=crop', 2, 2)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, icon_url = EXCLUDED.icon_url;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- 4. Products
INSERT INTO products (id, sku, name, slug, description, price, original_price, category_id, main_image_url, seller_name, rating_score, review_count, sales_count) VALUES
  (1, 'PHN-INFX-HOT30', 'Infinix Hot 30 6.78" 8GB RAM 128GB ROM 5000mAh', 'infinix-hot-30-8gb-128gb', 'Powerful gaming smartphone with 90Hz FHD+ Display, 50MP Dual Camera, and 33W Fast Charging. Official 1 Year Warranty in Kenya.', 18499.00, 22999.00, 5, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop', 'Infinix Official Store', 4.85, 142, 1250),
  (2, 'PHN-TEC-CAM20', 'Tecno Camon 20 6.67" 8GB RAM 256GB ROM 64MP Camera', 'tecno-camon-20-8gb-256gb', 'Ultra-clear 64MP Night portrait camera with AMOLED display and under-display fingerprint scanner.', 24999.00, 28999.00, 5, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop', 'Tecno Official Store', 4.90, 89, 830),
  (3, 'AUD-ORIM-FREEPODS4', 'Oraimo FreePods 4 ANC Wireless Earphones', 'oraimo-freepods-4-anc', 'Active Noise Cancellation, 35.5-hour playback, tuned by Oraimo Sound Studio with heavy bass.', 3299.00, 4500.00, 6, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop', 'Oraimo Flagship Store', 4.75, 310, 3400),
  (4, 'TV-VIT-32SMART', 'Vitra 32" Frameless Android Smart LED TV - Black', 'vitra-32-smart-tv', 'HD Ready LED TV with built-in Wi-Fi, Netflix, YouTube, and digital DVB-T2 receiver for free-to-air Kenyan channels.', 13999.00, 17500.00, 7, 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop', 'Vitra Electronics', 4.65, 54, 490)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price;

SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));

-- 5. Product Images
INSERT INTO product_images (product_id, image_url, sort_order) VALUES
  (1, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop', 1),
  (1, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop', 2),
  (2, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop', 1),
  (3, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop', 1),
  (4, 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop', 1)
ON CONFLICT DO NOTHING;

-- 6. Product SKUs / Variations
INSERT INTO product_skus (id, product_id, sku_code, spec_name, price, stock, image_url) VALUES
  (1, 1, 'PHN-INFX-HOT30-BLK', 'Color: Sonic Black', 18499.00, 45, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop'),
  (2, 1, 'PHN-INFX-HOT30-BLU', 'Color: Surfing Green', 18499.00, 30, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop'),
  (3, 2, 'PHN-TEC-CAM20-BLK', 'Color: Predawn Black', 24999.00, 20, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop'),
  (4, 3, 'AUD-ORIM-FREEPODS4-WHT', 'Color: White', 3299.00, 150, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop'),
  (5, 4, 'TV-VIT-32SMART-STD', 'Size: 32 Inch', 13999.00, 15, 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop')
ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock;

SELECT setval('product_skus_id_seq', (SELECT MAX(id) FROM product_skus));

-- 7. Flash Sales
INSERT INTO flash_sales (product_id, sku_id, flash_price, stock_allocated, stock_sold, start_time, end_time, is_active) VALUES
  (1, 1, 16999.00, 50, 28, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', true),
  (3, 4, 2899.00, 100, 64, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', true)
ON CONFLICT DO NOTHING;

-- 8. Banners
INSERT INTO banners (title, image_url, target_url, banner_type, sort_order, is_active) VALUES
  ('Super Shopping Day Kenya', 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&auto=format&fit=crop', '/flash-sale', 'home_top', 1, true),
  ('Oraimo Sound Festival', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&auto=format&fit=crop', '/product/oraimo-freepods-4-anc', 'home_top', 2, true),
  ('Smart TVs Mega Discount', 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop', '/category/smart-tvs', 'home_small', 1, true)
ON CONFLICT DO NOTHING;

-- 9. Search Keywords
INSERT INTO search_keywords (keyword, target_url, is_hot, search_count, sort_order) VALUES
  ('Infinix', '/search?q=Infinix', true, 12500, 1),
  ('Oraimo', '/search?q=Oraimo', true, 9800, 2),
  ('Smart TV', '/search?q=Smart+TV', true, 8400, 3),
  ('Airpods', '/search?q=Airpods', true, 6200, 4),
  ('Shoes', '/search?q=Shoes', false, 4100, 5)
ON CONFLICT (keyword) DO NOTHING;

-- 10. Reviews
INSERT INTO reviews (product_id, user_id, rating, comment, reviewer_name, is_verified_purchase) VALUES
  (1, 1, 5, 'Great phone! Delivered quickly to Kilimani in under 24 hours. Battery lasts 2 days.', 'Juma O.', true),
  (3, 1, 5, 'Bass is heavy and ANC works well on Matatus!', 'Juma O.', true)
ON CONFLICT DO NOTHING;
