require('dotenv').config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET === 'replace_this_with_a_long_random_secret') {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in backend/.env');
}
const production = process.env.NODE_ENV === 'production';
const clientOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
if (production && !clientOrigins.length) {
  throw new Error('Set CLIENT_ORIGIN to the deployed frontend origin in production');
}
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const uploadsDirectory = require('./config/uploads');
const api = require('./routes/api');
const errorHandler = require('./middleware/errors');
const app = express();
const allowedOrigins = new Set(clientOrigins.length ? clientOrigins : [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501'
]);
if (!production) {
  for (const origin of [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501'
  ]) {
    allowedOrigins.add(origin);
  }
}
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  }
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDirectory));
app.get('/', (req, res) => res.json({
  app: 'ShopEase API',
  api: '/api',
  health: '/api/health'
}));
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', app: 'ShopEase API', database: 'connected' });
  } catch (error) {
    console.error('Health check database connectivity failed:', error.code || error.message);
    res.status(503).json({ status: 'error', app: 'ShopEase API', database: 'unavailable' });
  }
});
app.use('/api', api);
app.use(errorHandler);
const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => console.log(`ShopEase API listening on port ${port}`));
