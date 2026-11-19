-- One-time upgrade for databases that already have the order-management schema.
USE shop_ease;

ALTER TABLE users
  ADD COLUMN mobile VARCHAR(15) NULL AFTER email;

ALTER TABLE products
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER stock;

CREATE TABLE customer_addresses (
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

CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  alt_text VARCHAR(180) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_image(product_id,image_url),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO product_images(product_id,image_url,alt_text,is_primary)
SELECT p.id,p.image_url,p.name,1 FROM products p
WHERE p.image_url IS NOT NULL AND p.image_url<>'';

ALTER TABLE orders
  MODIFY status ENUM('Pending','Confirmed','Processing','Shipped','Out for Delivery','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  ADD COLUMN customer_email VARCHAR(150) NULL AFTER payment_method,
  ADD COLUMN address_id INT NULL AFTER customer_email,
  ADD COLUMN address_house VARCHAR(100) NULL,
  ADD COLUMN address_street VARCHAR(255) NULL,
  ADD COLUMN address_landmark VARCHAR(255) NULL,
  ADD COLUMN address_city VARCHAR(100) NULL,
  ADD COLUMN address_state VARCHAR(100) NULL,
  ADD COLUMN address_postal_code CHAR(6) NULL,
  ADD COLUMN address_country VARCHAR(100) NULL,
  ADD COLUMN delivery_instructions VARCHAR(500) NULL,
  ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN delivery_charges DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD INDEX idx_orders_user_created(user_id,created_at),
  ADD CONSTRAINT fk_orders_customer_address FOREIGN KEY(address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

UPDATE orders o JOIN users u ON u.id=o.user_id
SET o.customer_email=u.email,o.subtotal=o.total_amount
WHERE o.customer_email IS NULL OR o.subtotal=0;

ALTER TABLE order_items
  ADD COLUMN compare_at_price DECIMAL(10,2) NULL,
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN line_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD INDEX idx_order_items_order(order_id);

UPDATE order_items SET line_subtotal=quantity*unit_price WHERE line_subtotal=0;

CREATE TABLE payments (
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

INSERT INTO payments(order_id,payment_method,status,amount)
SELECT o.id,o.payment_method,'Pending',o.total_amount
FROM orders o;

CREATE TABLE order_status_history (
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

INSERT INTO order_status_history(order_id,status,note,created_at)
SELECT id,status,'Status recorded during marketplace upgrade',created_at FROM orders;

CREATE TABLE coupons (
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
