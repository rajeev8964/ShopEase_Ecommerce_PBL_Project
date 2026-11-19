CREATE DATABASE IF NOT EXISTS shop_ease;
USE shop_ease;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  mobile VARCHAR(15) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','customer') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2) NULL,
  stock INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  category_id INT NULL,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  mobile VARCHAR(15) NOT NULL,
  email VARCHAR(150) NOT NULL,
  house VARCHAR(100) NOT NULL,
  street VARCHAR(255) NOT NULL,
  landmark VARCHAR(255) NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code CHAR(6) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'India',
  delivery_instructions VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_addresses_user(user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  alt_text VARCHAR(180) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_image(product_id,image_url),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_cart_user_product(user_id,product_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(40) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status ENUM('Pending','Confirmed','Processing','Shipped','Out for Delivery','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  shipping_address TEXT NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash on Delivery',
  customer_email VARCHAR(150) NULL,
  address_id INT NULL,
  address_house VARCHAR(100) NULL,
  address_street VARCHAR(255) NULL,
  address_landmark VARCHAR(255) NULL,
  address_city VARCHAR(100) NULL,
  address_state VARCHAR(100) NULL,
  address_postal_code CHAR(6) NULL,
  address_country VARCHAR(100) NULL,
  delivery_instructions VARCHAR(500) NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_charges DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_user_created(user_id,created_at),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2) NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  INDEX idx_order_items_order(order_id),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  payment_method VARCHAR(50) NOT NULL,
  status ENUM('Pending','Paid','Failed','Refunded') NOT NULL DEFAULT 'Pending',
  amount DECIMAL(10,2) NOT NULL,
  gateway VARCHAR(40) NULL,
  transaction_reference VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status ENUM('Pending','Confirmed','Processing','Shipped','Out for Delivery','Delivered','Cancelled') NOT NULL,
  note VARCHAR(500) NULL,
  changed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_status_history_order(order_id,created_at),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  discount_type ENUM('percentage','fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  maximum_discount DECIMAL(10,2) NULL,
  minimum_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  starts_at DATETIME NULL,
  expires_at DATETIME NULL,
  usage_limit INT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_user_product(user_id,product_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO categories(name) VALUES ('Electronics');
INSERT IGNORE INTO categories(name) VALUES ('Fashion');
INSERT IGNORE INTO categories(name) VALUES ('Home & Kitchen');
INSERT IGNORE INTO categories(name) VALUES ('Accessories');
INSERT IGNORE INTO categories(name) VALUES ('Earbuds');
INSERT IGNORE INTO categories(name) VALUES ('Neckbands');
INSERT IGNORE INTO categories(name) VALUES ('Chargers');
INSERT IGNORE INTO categories(name) VALUES ('Cables');
INSERT IGNORE INTO categories(name) VALUES ('Speakers');

INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Wireless Earbuds','Rich, clear wireless sound with a compact charging case.',1499.00,25,id,
  'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=800&q=80'
FROM categories WHERE name='Electronics'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Wireless Earbuds');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Bluetooth Neckband','Comfortable Bluetooth neckband for music and hands-free calls.',899.00,30,id,
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'
FROM categories WHERE name='Electronics'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Bluetooth Neckband');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Fast Charging Cable','Durable fast-charging cable for everyday charging and syncing.',299.00,50,id,
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80'
FROM categories WHERE name='Accessories'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Fast Charging Cable');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder 20W Fast Charger','Compact fast charger with 20W charging support and multiple device compatibility.',699.00,25,id,
  '/assets/products/thunder-fast-charger.svg'
FROM categories WHERE name='Chargers'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder 20W Fast Charger');

INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Pro Wireless Earbuds','Premium wireless earbuds with clear sound, comfortable design and long battery backup.',1499.00,30,id,
  'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=800&q=85'
FROM categories WHERE name='Earbuds'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Pro Wireless Earbuds');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Bass Bluetooth Neckband','Stylish Bluetooth neckband with powerful bass, lightweight design and comfortable fit.',899.00,30,id,
  'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=85'
FROM categories WHERE name='Neckbands'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Bass Bluetooth Neckband');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Type-C Fast Charging Cable','Durable Type-C charging cable with fast charging and data transfer support.',299.00,50,id,
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=85'
FROM categories WHERE name='Cables'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Type-C Fast Charging Cable');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Bluetooth 5.3 Speaker','Portable Bluetooth speaker with powerful audio, compact design and rechargeable battery.',1199.00,20,id,
  'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=800&q=85'
FROM categories WHERE name='Speakers'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Bluetooth 5.3 Speaker');
INSERT INTO products(name,description,price,stock,category_id,image_url)
SELECT 'Thunder Wireless Charging Pad','Modern wireless charging pad with a compact design for compatible devices.',999.00,20,id,
  '/assets/products/thunder-wireless-charging-pad.svg'
FROM categories WHERE name='Accessories'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder Wireless Charging Pad');

INSERT INTO product_images(product_id,image_url,alt_text,is_primary)
SELECT p.id,p.image_url,p.name,1 FROM products p
WHERE p.image_url IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.image_url=p.image_url);

-- Register an account through /api/auth/register, then promote it:
-- UPDATE users SET role='admin' WHERE email='your-admin-email@example.com';
