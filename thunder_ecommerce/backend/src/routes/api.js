const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { protect, adminOnly } = require('../middleware/auth');

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../../uploads/'),
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const extension = path.extname(file.originalname).toLowerCase();
    const ok = allowedTypes[extension] === file.mimetype;
    const error = ok ? null : Object.assign(new Error('Only JPG, PNG or WEBP images are allowed'), { status: 400 });
    cb(error, ok);
  }
});
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const orderStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

router.post('/auth/register', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('mobile').trim().matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number'),
  body('password').isLength({ min: 8 }),
  body('password_confirmation').custom((value, { req }) => value === req.body.password)
    .withMessage('Password confirmation does not match')
], validate, asyncRoute(async (req, res) => {
  const { name, email, mobile, password } = req.body;
  const hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users(name,email,mobile,password_hash,role) VALUES(?,?,?,?,?)',
    [name, email, mobile, hash, 'customer']
  );
  res.status(201).json({ message: 'Account created', user: { id: result.insertId, name, email, mobile, role: 'customer' } });
}));

router.post('/auth/login', [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty()
], validate, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [req.body.email]);
  if (!rows.length || !(await bcrypt.compare(req.body.password, rows[0].password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const user = rows[0];
  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.role } });
}));
router.get('/auth/me', protect, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute('SELECT id,name,email,mobile,role FROM users WHERE id=?', [req.user.id]);
  res.json(rows[0] || null);
}));

router.get('/categories', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*,(SELECT p.image_url FROM products p WHERE p.category_id=c.id AND p.is_active=1
      ORDER BY p.created_at DESC,p.id DESC LIMIT 1) image_url
     FROM categories c ORDER BY c.name`
  );
  res.json(rows);
}));
router.post('/categories', protect, adminOnly, [body('name').trim().isLength({ min: 1, max: 100 })], validate,
  asyncRoute(async (req, res) => {
    const [result] = await pool.execute('INSERT INTO categories(name) VALUES(?)', [req.body.name]);
    res.status(201).json({ id: result.insertId, name: req.body.name });
  }));
router.put('/categories/:id', protect, adminOnly, [body('name').trim().isLength({ min: 1, max: 100 })], validate,
  asyncRoute(async (req, res) => {
    const [result] = await pool.execute('UPDATE categories SET name=? WHERE id=?', [req.body.name, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category updated' });
  }));
router.delete('/categories/:id', protect, adminOnly, asyncRoute(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM categories WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Category not found' });
  res.json({ message: 'Category deleted' });
}));

router.get('/products', asyncRoute(async (req, res) => {
  const sortOptions = {
    newest: 'p.created_at DESC,p.id DESC',
    name_asc: 'p.name ASC',
    price_asc: 'p.price ASC,p.name ASC',
    price_desc: 'p.price DESC,p.name ASC',
    stock_desc: 'p.stock DESC,p.name ASC',
    popularity: "(SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.status<>'Cancelled') DESC,p.name ASC"
  };
  if (req.query.sort && !Object.prototype.hasOwnProperty.call(sortOptions, req.query.sort)) {
    return res.status(400).json({ message: 'Invalid product sort option' });
  }
  for (const key of ['minPrice', 'maxPrice']) {
    if (req.query[key] !== undefined && req.query[key] !== '' &&
        (!Number.isFinite(Number(req.query[key])) || Number(req.query[key]) < 0)) {
      return res.status(400).json({ message: `${key} must be a non-negative number` });
    }
  }
  if (req.query.category && !/^\d+$/.test(req.query.category)) {
    return res.status(400).json({ message: 'Category must be a valid ID' });
  }
  if (req.query.search && req.query.search.length > 100) {
    return res.status(400).json({ message: 'Search query is too long' });
  }
  if (req.query.offers !== undefined && !['true', 'false'].includes(req.query.offers)) {
    return res.status(400).json({ message: 'offers must be true or false' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const offset = (page - 1) * limit;
  const where = ['p.is_active=1'];
  const params = [];
  if (req.query.search) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`);
  }
  if (req.query.category) {
    where.push('p.category_id=?');
    params.push(req.query.category);
  }
  if (req.query.minPrice !== undefined && req.query.minPrice !== '') {
    where.push('p.price>=?');
    params.push(Number(req.query.minPrice));
  }
  if (req.query.maxPrice !== undefined && req.query.maxPrice !== '') {
    where.push('p.price<=?');
    params.push(Number(req.query.maxPrice));
  }
  if (req.query.offers === 'true') where.push('p.compare_at_price IS NOT NULL AND p.compare_at_price>p.price');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items] = await pool.execute(
    `SELECT p.*,c.name category_name,COALESCE(rv.average_rating,0) average_rating,COALESCE(rv.review_count,0) review_count
     FROM products p LEFT JOIN categories c ON c.id=p.category_id
     LEFT JOIN (SELECT product_id,AVG(rating) average_rating,COUNT(*) review_count FROM reviews GROUP BY product_id) rv ON rv.product_id=p.id
     ${clause} ORDER BY ${sortOptions[req.query.sort] || sortOptions.newest} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [count] = await pool.execute(`SELECT COUNT(*) total FROM products p ${clause}`, params);
  res.json({ items, page, limit, total: count[0].total, totalPages: Math.ceil(count[0].total / limit) });
}));
router.get('/products/best-sellers', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*,c.name category_name,SUM(oi.quantity) units_sold
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
     WHERE o.status<>'Cancelled' AND p.is_active=1
     GROUP BY p.id,c.name ORDER BY units_sold DESC,p.name ASC LIMIT 4`
  );
  res.json(rows);
}));
router.get('/products/:id', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.*,c.name category_name,COALESCE(rv.average_rating,0) average_rating,COALESCE(rv.review_count,0) review_count
     FROM products p LEFT JOIN categories c ON c.id=p.category_id
     LEFT JOIN (SELECT product_id,AVG(rating) average_rating,COUNT(*) review_count FROM reviews GROUP BY product_id) rv ON rv.product_id=p.id
     WHERE p.id=? AND p.is_active=1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Product not found' });
  res.json(rows[0]);
}));
router.get('/admin/products', protect, adminOnly, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id
     ORDER BY p.created_at DESC,p.id DESC`
  );
  res.json({ items: rows });
}));
router.post(['/products', '/admin/products'], protect, adminOnly, upload.single('image'), [
  body('name').trim().isLength({ min: 1, max: 180 }),
  body('price').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 }),
  body('description').optional().isString(),
  body('category_id').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('compare_at_price').optional({ checkFalsy: true }).isFloat({ min: 0 })
    .custom((value, { req }) => Number(value) > Number(req.body.price))
    .withMessage('Compare-at price must be greater than the selling price'),
  body('is_active').optional().custom(value => ['0', '1', 0, 1, true, false].includes(value))
], validate, asyncRoute(async (req, res) => {
  const { name, description = '', price, stock, category_id, compare_at_price } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || null);
  const [result] = await pool.execute(
    'INSERT INTO products(name,description,price,compare_at_price,stock,is_active,category_id,image_url) VALUES(?,?,?,?,?,?,?,?)',
    [name, description, price, compare_at_price || null, stock, req.body.is_active === undefined ? 1 : Number(req.body.is_active), category_id || null, imageUrl]
  );
  if (imageUrl) await pool.execute(
    'INSERT INTO product_images(product_id,image_url,alt_text,is_primary) VALUES(?,?,?,1)',
    [result.insertId, imageUrl, name]
  );
  res.status(201).json({ id: result.insertId, message: 'Product created' });
}));
router.put(['/products/:id', '/admin/products/:id'], protect, adminOnly, upload.single('image'), [
  body('name').trim().isLength({ min: 1, max: 180 }),
  body('price').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 }),
  body('description').optional().isString(),
  body('category_id').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('compare_at_price').optional({ checkFalsy: true }).isFloat({ min: 0 })
    .custom((value, { req }) => Number(value) > Number(req.body.price))
    .withMessage('Compare-at price must be greater than the selling price'),
  body('is_active').optional().custom(value => ['0', '1', 0, 1, true, false].includes(value))
], validate, asyncRoute(async (req, res) => {
  const { name, description = '', price, stock, category_id, compare_at_price } = req.body;
  const fields = ['name=?', 'description=?', 'price=?', 'compare_at_price=?', 'stock=?', 'category_id=?'];
  const values = [name, description, price, compare_at_price || null, stock, category_id || null];
  if (req.body.is_active !== undefined) {
    fields.push('is_active=?');
    values.push(Number(req.body.is_active));
  }
  let newImageUrl = null;
  if (req.file) {
    fields.push('image_url=?');
    newImageUrl = `/uploads/${req.file.filename}`;
    values.push(newImageUrl);
  } else if (req.body.image_url !== undefined) {
    fields.push('image_url=?');
    newImageUrl = req.body.image_url || null;
    values.push(req.body.image_url || null);
  }
  values.push(req.params.id);
  const [result] = await pool.execute(`UPDATE products SET ${fields.join(',')} WHERE id=?`, values);
  if (!result.affectedRows) return res.status(404).json({ message: 'Product not found' });
  if (newImageUrl) await pool.execute(
    'UPDATE product_images SET is_primary=0 WHERE product_id=?',
    [req.params.id]
  );
  if (newImageUrl) await pool.execute(
    'INSERT INTO product_images(product_id,image_url,alt_text,is_primary) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE alt_text=VALUES(alt_text),is_primary=1',
    [req.params.id, newImageUrl, name]
  );
  res.json({ message: 'Product updated' });
}));
router.delete(['/products/:id', '/admin/products/:id'], protect, adminOnly, asyncRoute(async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM products WHERE id=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      error.status = 409;
      error.message = 'This product has order history and cannot be deleted';
    }
    throw error;
  }
}));

router.get('/cart', protect, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT ci.id,ci.quantity,p.id product_id,p.name,p.description,p.price,p.compare_at_price,p.image_url,p.stock,p.is_active,(ci.quantity*p.price) subtotal FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.user_id=?',
    [req.user.id]
  );
  res.json(rows);
}));
router.post('/cart/merge', protect, [
  body('items').isArray({ min: 1, max: 100 }),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 })
], validate, asyncRoute(async (req, res) => {
  const quantities = new Map();
  for (const item of req.body.items) {
    const productId = Number(item.product_id);
    quantities.set(productId, (quantities.get(productId) || 0) + Number(item.quantity));
  }
  const connection = await pool.getConnection();
  const adjusted = [];
  try {
    await connection.beginTransaction();
    for (const [productId, guestQuantity] of quantities) {
      const [products] = await connection.execute('SELECT stock,is_active FROM products WHERE id=? FOR UPDATE', [productId]);
      if (!products.length) {
        adjusted.push({ product_id: productId, reason: 'Product is no longer available' });
        continue;
      }
      const [existing] = await connection.execute(
        'SELECT id,quantity FROM cart_items WHERE user_id=? AND product_id=? FOR UPDATE',
        [req.user.id, productId]
      );
      const currentQuantity = Number(existing[0]?.quantity || 0);
      if (!products[0].is_active) {
        if (existing.length) await connection.execute('DELETE FROM cart_items WHERE id=? AND user_id=?', [existing[0].id, req.user.id]);
        adjusted.push({ product_id: productId, reason: 'Product is no longer available' });
        continue;
      }
      const requestedQuantity = currentQuantity + guestQuantity;
      const finalQuantity = Math.min(requestedQuantity, Number(products[0].stock));
      if (finalQuantity > 0) {
        await connection.execute(
          'INSERT INTO cart_items(user_id,product_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)',
          [req.user.id, productId, finalQuantity]
        );
      } else if (existing.length) {
        await connection.execute('DELETE FROM cart_items WHERE id=? AND user_id=?', [existing[0].id, req.user.id]);
      }
      if (finalQuantity !== requestedQuantity) {
        adjusted.push({
          product_id: productId,
          requested: requestedQuantity,
          available: finalQuantity,
          reason: finalQuantity ? 'Quantity capped to current stock' : 'Product is out of stock'
        });
      }
    }
    await connection.commit();
    res.json({ message: 'Guest cart merged', adjusted });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
router.post('/cart', protect, [
  body('product_id').isInt({ min: 1 }),
  body('quantity').optional().isInt({ min: 1 })
], validate, asyncRoute(async (req, res) => {
  const quantity = Number(req.body.quantity || 1);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [products] = await connection.execute(
      'SELECT stock,is_active FROM products WHERE id=? FOR UPDATE',
      [req.body.product_id]
    );
    if (!products.length || !products[0].is_active) {
      await connection.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }
    const [existing] = await connection.execute(
      'SELECT quantity FROM cart_items WHERE user_id=? AND product_id=? FOR UPDATE',
      [req.user.id, req.body.product_id]
    );
    if (Number(products[0].stock) < quantity + Number(existing[0]?.quantity || 0)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Requested quantity exceeds available stock' });
    }
    await connection.execute(
      'INSERT INTO cart_items(user_id,product_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',
      [req.user.id, req.body.product_id, quantity]
    );
    await connection.commit();
    res.status(201).json({ message: 'Added to cart' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
router.put('/cart/:id', protect, [body('quantity').isInt({ min: 1 })], validate,
  asyncRoute(async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT ci.product_id,p.stock,p.is_active FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.id=? AND ci.user_id=? FOR UPDATE',
        [req.params.id, req.user.id]
      );
      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Cart item not found' });
      }
      if (!rows[0].is_active) {
        await connection.rollback();
        return res.status(409).json({ message: 'Product is no longer available' });
      }
      if (Number(req.body.quantity) > Number(rows[0].stock)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Requested quantity exceeds available stock' });
      }
      await connection.execute('UPDATE cart_items SET quantity=? WHERE id=? AND user_id=?', [req.body.quantity, req.params.id, req.user.id]);
      await connection.commit();
      res.json({ message: 'Cart updated' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }));
router.delete('/cart/:id', protect, asyncRoute(async (req, res) => {
  await pool.execute('DELETE FROM cart_items WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Removed from cart' });
}));

router.post('/orders', protect, [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('mobile').trim().matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10-digit Indian mobile number'),
  body('address.house').trim().isLength({ min: 1, max: 100 }),
  body('address.street').trim().isLength({ min: 2, max: 255 }),
  body('address.landmark').optional({ nullable: true }).trim().isLength({ max: 255 }),
  body('address.city').trim().isLength({ min: 2, max: 100 }),
  body('address.state').trim().isLength({ min: 2, max: 100 }),
  body('address.postal_code').trim().matches(/^\d{6}$/).withMessage('Enter a valid 6-digit PIN code'),
  body('address.country').trim().isLength({ min: 2, max: 100 }),
  body('address.delivery_instructions').optional({ nullable: true }).trim().isLength({ max: 500 }),
  body('payment_method').equals('cod').withMessage('Cash on Delivery is the only available payment method')
], validate, asyncRoute(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [cartRows] = await connection.execute(
      `SELECT ci.product_id,ci.quantity,p.name,p.price,p.compare_at_price,p.stock,p.is_active
       FROM cart_items ci JOIN products p ON p.id=ci.product_id
       WHERE ci.user_id=? FOR UPDATE`,
      [req.user.id]
    );
    if (!cartRows.length) {
      const error = new Error('Cart is empty');
      error.status = 400;
      throw error;
    }

    let subtotalCents = 0;
    let discountCents = 0;
    for (const item of cartRows) {
      if (!item.is_active) {
        const error = new Error(`${item.name} is no longer available`);
        error.status = 409;
        throw error;
      }
      if (Number(item.stock) < Number(item.quantity)) {
        const error = new Error(`Insufficient stock for ${item.name}`);
        error.status = 409;
        throw error;
      }
      const unitCents = Math.round(Number(item.price) * 100);
      const compareCents = Number(item.compare_at_price) > Number(item.price)
        ? Math.round(Number(item.compare_at_price) * 100) : unitCents;
      subtotalCents += compareCents * Number(item.quantity);
      discountCents += (compareCents - unitCents) * Number(item.quantity);
    }

    const address = req.body.address;
    const [addressResult] = await connection.execute(
      `INSERT INTO customer_addresses
       (user_id,full_name,mobile,email,house,street,landmark,city,state,postal_code,country,delivery_instructions)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, req.body.name, req.body.mobile, req.body.email, address.house, address.street,
        address.landmark || null, address.city, address.state, address.postal_code, address.country,
        address.delivery_instructions || null]
    );
    const deliveryCents = 0;
    const totalCents = subtotalCents - discountCents + deliveryCents;
    const total = totalCents / 100;
    const subtotal = subtotalCents / 100;
    const discount = discountCents / 100;
    const shippingAddress = [
      address.house, address.street, address.landmark, address.city,
      address.state, address.postal_code, address.country
    ].filter(Boolean).join(', ');
    const orderCode = `SE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const [order] = await connection.execute(
      `INSERT INTO orders
       (order_code,user_id,customer_name,customer_email,mobile,total_amount,status,shipping_address,payment_method,
        address_id,address_house,address_street,address_landmark,address_city,address_state,address_postal_code,
        address_country,delivery_instructions,subtotal,discount_amount,delivery_charges)
       VALUES(?,?,?,?,?,?,'Pending',?,'Cash on Delivery',?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderCode, req.user.id, req.body.name, req.body.email, req.body.mobile, total, shippingAddress,
        addressResult.insertId, address.house, address.street, address.landmark || null, address.city, address.state,
        address.postal_code, address.country, address.delivery_instructions || null, subtotal, discount, deliveryCents / 100]
    );
    for (const item of cartRows) {
      const unitCents = Math.round(Number(item.price) * 100);
      const compareCents = Number(item.compare_at_price) > Number(item.price)
        ? Math.round(Number(item.compare_at_price) * 100) : unitCents;
      const quantity = Number(item.quantity);
      await connection.execute(
        `INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,compare_at_price,discount_amount,line_subtotal)
         VALUES(?,?,?,?,?,?,?,?)`,
        [order.insertId, item.product_id, item.name, quantity, unitCents / 100, compareCents / 100,
          (compareCents - unitCents) * quantity / 100, compareCents * quantity / 100]
      );
      const [updated] = await connection.execute(
        'UPDATE products SET stock=stock-? WHERE id=? AND stock>=? AND is_active=1',
        [quantity, item.product_id, quantity]
      );
      if (!updated.affectedRows) {
        const error = new Error(`Stock changed while placing the order for ${item.name}. Please review your cart.`);
        error.status = 409;
        throw error;
      }
    }
    await connection.execute(
      "INSERT INTO payments(order_id,payment_method,status,amount,gateway) VALUES(?,'Cash on Delivery','Pending',?,'cod')",
      [order.insertId, total]
    );
    await connection.execute(
      "INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES(?,'Pending','Order placed',?)",
      [order.insertId, req.user.id]
    );
    await connection.execute('DELETE FROM cart_items WHERE user_id=?', [req.user.id]);
    await connection.commit();
    res.status(201).json({
      message: 'Your Order Has Been Placed Successfully!',
      order_id: orderCode,
      subtotal,
      discount,
      delivery_charges: 0,
      total
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
router.get(['/orders/my-orders', '/orders'], protect, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT o.order_code,o.total_amount,o.subtotal,o.discount_amount,o.delivery_charges,o.status,o.shipping_address,
      o.payment_method,o.created_at,
      (SELECT p.status FROM payments p WHERE p.order_id=o.id LIMIT 1) payment_status,
      (SELECT GROUP_CONCAT(CONCAT(oi.product_name,' × ',oi.quantity) ORDER BY oi.id SEPARATOR ', ')
       FROM order_items oi WHERE oi.order_id=o.id) products
     FROM orders o WHERE o.user_id=? ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));
router.get('/orders/:id', protect, asyncRoute(async (req, res) => {
  const [orders] = await pool.execute(
    `SELECT o.*,COALESCE(o.customer_email,u.email) email,p.status payment_status
     FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN payments p ON p.order_id=o.id
     WHERE o.order_code=? AND (o.user_id=? OR ?='admin')`,
    [req.params.id, req.user.id, req.user.role]
  );
  if (!orders.length) return res.status(404).json({ message: 'Order not found' });
  const [items] = await pool.execute(
    `SELECT product_id,product_name name,quantity,unit_price,compare_at_price,discount_amount,line_subtotal subtotal,
      quantity*unit_price payable_subtotal FROM order_items WHERE order_id=(SELECT id FROM orders WHERE order_code=?)`,
    [req.params.id]
  );
  const [history] = await pool.execute(
    'SELECT status,note,created_at FROM order_status_history WHERE order_id=(SELECT id FROM orders WHERE order_code=?) ORDER BY created_at,id',
    [req.params.id]
  );
  res.json({ ...orders[0], items, history });
}));
router.get('/admin/orders', protect, adminOnly, asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.id,o.order_code,o.customer_name,COALESCE(o.customer_email,u.email) email,o.mobile,o.total_amount,
      o.subtotal,o.discount_amount,o.delivery_charges,o.shipping_address,o.address_house,o.address_street,o.address_landmark,
      o.address_city,o.address_state,o.address_postal_code,o.address_country,o.delivery_instructions,
      o.created_at,o.payment_method,o.status,
      (SELECT p.status FROM payments p WHERE p.order_id=o.id LIMIT 1) payment_status,
      (SELECT GROUP_CONCAT(oi.product_name ORDER BY oi.id SEPARATOR ', ')
       FROM order_items oi WHERE oi.order_id=o.id) products,
      (SELECT GROUP_CONCAT(oi.quantity ORDER BY oi.id SEPARATOR ', ')
       FROM order_items oi WHERE oi.order_id=o.id) quantities,
      (SELECT GROUP_CONCAT(CONCAT(oi.product_name,': ₹',oi.unit_price) ORDER BY oi.id SEPARATOR ', ')
       FROM order_items oi WHERE oi.order_id=o.id) unit_prices,
      (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id=o.id) quantity
     FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC`
  );
  res.json(rows);
}));
router.get('/admin/orders/:id', protect, adminOnly, asyncRoute(async (req, res) => {
  const [orders] = await pool.execute(
    `SELECT o.*,COALESCE(o.customer_email,u.email) email,p.status payment_status
     FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN payments p ON p.order_id=o.id
     WHERE o.order_code=?`,
    [req.params.id]
  );
  if (!orders.length) return res.status(404).json({ message: 'Order not found' });
  const [items] = await pool.execute(
    `SELECT product_id,product_name name,quantity,unit_price,compare_at_price,discount_amount,line_subtotal subtotal,
      quantity*unit_price payable_subtotal FROM order_items WHERE order_id=?`,
    [orders[0].id]
  );
  const [history] = await pool.execute(
    'SELECT h.status,h.note,h.created_at,u.name changed_by FROM order_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.order_id=? ORDER BY h.created_at,h.id',
    [orders[0].id]
  );
  res.json({ ...orders[0], items, history });
}));
router.patch('/admin/orders/:id/status', protect, adminOnly, [
  body('status').isIn(orderStatuses)
], validate, asyncRoute(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute('SELECT id,status FROM orders WHERE order_code=? FOR UPDATE', [req.params.id]);
    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }
    const order = orders[0];
    if (order.status === req.body.status) {
      await connection.commit();
      return res.json({ message: 'Order status is unchanged' });
    }
    const [items] = await connection.execute(
      'SELECT product_id,quantity FROM order_items WHERE order_id=?',
      [order.id]
    );
    if (order.status !== 'Cancelled' && req.body.status === 'Cancelled') {
      for (const item of items) {
        await connection.execute('UPDATE products SET stock=stock+? WHERE id=?', [item.quantity, item.product_id]);
      }
    } else if (order.status === 'Cancelled' && req.body.status !== 'Cancelled') {
      for (const item of items) {
        const [updated] = await connection.execute(
          'UPDATE products SET stock=stock-? WHERE id=? AND stock>=?',
          [item.quantity, item.product_id, item.quantity]
        );
        if (!updated.affectedRows) {
          const error = new Error('Cannot reopen this order because one or more products no longer have enough stock');
          error.status = 409;
          throw error;
        }
      }
    }
    await connection.execute('UPDATE orders SET status=? WHERE id=?', [req.body.status, order.id]);
    await connection.execute(
      'INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES(?,?,?,?)',
      [order.id, req.body.status, `Status changed to ${req.body.status}`, req.user.id]
    );
    await connection.commit();
    res.json({ message: 'Order status updated' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.post('/reviews', protect, [
  body('product_id').isInt({ min: 1 }),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().isString().isLength({ max: 2000 })
], validate, asyncRoute(async (req, res) => {
  const [result] = await pool.execute(
    'INSERT INTO reviews(user_id,product_id,rating,comment) VALUES(?,?,?,?)',
    [req.user.id, req.body.product_id, req.body.rating, req.body.comment || '']
  );
  res.status(201).json({ id: result.insertId, message: 'Review submitted' });
}));
router.get('/products/:id/reviews', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT r.*,u.name customer_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.created_at DESC',
    [req.params.id]
  );
  res.json(rows);
}));
router.get('/reviews', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.rating,r.comment,r.created_at,u.name customer_name,p.name product_name
     FROM reviews r JOIN users u ON u.id=r.user_id JOIN products p ON p.id=r.product_id
     WHERE r.comment IS NOT NULL AND r.comment<>'' ORDER BY r.created_at DESC LIMIT 8`
  );
  res.json(rows);
}));
router.get('/admin/customers', protect, adminOnly, asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim();
  if (search.length > 100) return res.status(400).json({ message: 'Search query is too long' });
  const params = [];
  let searchClause = '';
  if (search) {
    searchClause = ' AND (u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.execute(
    `SELECT u.id,u.name,u.email,u.mobile,u.created_at,COUNT(DISTINCT o.id) orders,
      COALESCE(SUM(CASE WHEN o.status<>'Cancelled' THEN o.total_amount ELSE 0 END),0) spent,
      MAX(o.created_at) last_order_date
     FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='customer'${searchClause}
     GROUP BY u.id ORDER BY u.created_at DESC`,
    params
  );
  res.json(rows);
}));
router.get('/admin/dashboard', protect, adminOnly, asyncRoute(async (req, res) => {
  const [[users]] = await pool.query("SELECT COUNT(*) total FROM users WHERE role='customer'");
  const [[products]] = await pool.query('SELECT COUNT(*) total FROM products WHERE is_active=1');
  const [[orders]] = await pool.query('SELECT COUNT(*) total FROM orders');
  const [[sales]] = await pool.query("SELECT COALESCE(SUM(total_amount),0) total FROM orders WHERE status<>'Cancelled'");
  const [[pending]] = await pool.query("SELECT COUNT(*) total FROM orders WHERE status='Pending'");
  const [[delivered]] = await pool.query("SELECT COUNT(*) total FROM orders WHERE status='Delivered'");
  const [[cancelled]] = await pool.query("SELECT COUNT(*) total FROM orders WHERE status='Cancelled'");
  const [[lowStock]] = await pool.query('SELECT COUNT(*) total FROM products WHERE is_active=1 AND stock<=5');
  const [dailySales] = await pool.query(
    `SELECT DATE(created_at) label,COALESCE(SUM(total_amount),0) value FROM orders
     WHERE status<>'Cancelled' AND created_at>=CURRENT_DATE-INTERVAL 6 DAY
     GROUP BY DATE(created_at) ORDER BY DATE(created_at)`
  );
  const [monthlyRevenue] = await pool.query(
    `SELECT DATE_FORMAT(created_at,'%Y-%m') label,COALESCE(SUM(total_amount),0) value FROM orders
     WHERE status<>'Cancelled' AND created_at>=DATE_SUB(CURRENT_DATE,INTERVAL 5 MONTH)
     GROUP BY DATE_FORMAT(created_at,'%Y-%m') ORDER BY label`
  );
  const [bestSellers] = await pool.query(
    `SELECT oi.product_name name,SUM(oi.quantity) quantity FROM order_items oi
     JOIN orders o ON o.id=oi.order_id WHERE o.status<>'Cancelled'
     GROUP BY oi.product_id,oi.product_name ORDER BY quantity DESC LIMIT 5`
  );
  res.json({
    customers: users.total, products: products.total, orders: orders.total,
    revenue: Number(sales.total), pending: pending.total, delivered: delivered.total,
    cancelled: cancelled.total, low_stock: lowStock.total,
    charts: { dailySales, monthlyRevenue, bestSellers }
  });
}));
module.exports = router;
