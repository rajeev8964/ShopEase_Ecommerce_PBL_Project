USE shop_ease;

-- Run once on an existing ShopEase database after the original schema.sql.
ALTER TABLE orders
  ADD COLUMN order_code VARCHAR(40) NULL,
  ADD COLUMN customer_name VARCHAR(100) NULL,
  ADD COLUMN mobile VARCHAR(20) NULL,
  ADD COLUMN payment_method VARCHAR(100) NOT NULL DEFAULT 'Demo payment (no charge)';

UPDATE orders o
JOIN users u ON u.id=o.user_id
SET o.order_code=CONCAT('LEGACY-',o.id),
    o.customer_name=u.name,
    o.mobile='Not provided',
    o.status=CASE o.status
      WHEN 'placed' THEN 'Pending'
      WHEN 'processing' THEN 'Processing'
      WHEN 'shipped' THEN 'Shipped'
      WHEN 'delivered' THEN 'Delivered'
      WHEN 'cancelled' THEN 'Cancelled'
      ELSE o.status
    END;

ALTER TABLE orders
  MODIFY COLUMN status ENUM('Pending','Confirmed','Processing','Shipped','Delivered','Cancelled','placed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'Pending',
  MODIFY COLUMN order_code VARCHAR(40) NOT NULL,
  MODIFY COLUMN customer_name VARCHAR(100) NOT NULL,
  MODIFY COLUMN mobile VARCHAR(20) NOT NULL,
  ADD UNIQUE KEY uq_orders_order_code(order_code);

UPDATE orders SET status='Pending' WHERE status='placed';
UPDATE orders SET status='Processing' WHERE status='processing';
UPDATE orders SET status='Shipped' WHERE status='shipped';
UPDATE orders SET status='Delivered' WHERE status='delivered';
UPDATE orders SET status='Cancelled' WHERE status='cancelled';

ALTER TABLE orders
  MODIFY COLUMN status ENUM('Pending','Confirmed','Processing','Shipped','Delivered','Cancelled') NOT NULL DEFAULT 'Pending';

ALTER TABLE order_items ADD COLUMN product_name VARCHAR(180) NULL;
UPDATE order_items oi JOIN products p ON p.id=oi.product_id SET oi.product_name=p.name;
ALTER TABLE order_items MODIFY COLUMN product_name VARCHAR(180) NOT NULL;

INSERT IGNORE INTO categories(name) VALUES ('Electronics'),('Accessories');
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
SELECT 'Thunder 20W Fast Charger','Compact 20W fast charger for compatible phones and devices.',699.00,35,id,
  'https://images.unsplash.com/photo-1609592806596-b43bada2f7c4?auto=format&fit=crop&w=800&q=80'
FROM categories WHERE name='Accessories'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder 20W Fast Charger');
