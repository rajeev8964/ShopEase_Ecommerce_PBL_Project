USE shop_ease;

-- Run once on a database that already has the ShopEase order-management schema.
ALTER TABLE products ADD COLUMN compare_at_price DECIMAL(10,2) NULL;

INSERT IGNORE INTO categories(name) VALUES
  ('Earbuds'),('Neckbands'),('Chargers'),('Cables'),('Speakers'),('Accessories');

UPDATE products p
JOIN categories c ON c.name='Chargers'
SET p.description='Compact fast charger with 20W charging support and multiple device compatibility.',
    p.category_id=c.id,
    p.image_url='/assets/products/thunder-fast-charger.svg'
WHERE p.name='Thunder 20W Fast Charger';

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
SELECT 'Thunder 20W Fast Charger','Compact fast charger with 20W charging support and multiple device compatibility.',699.00,25,id,
  '/assets/products/thunder-fast-charger.svg'
FROM categories WHERE name='Chargers'
AND NOT EXISTS (SELECT 1 FROM products WHERE name='Thunder 20W Fast Charger');
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
