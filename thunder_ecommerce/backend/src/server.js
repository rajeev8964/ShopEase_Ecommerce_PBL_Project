require('dotenv').config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET === 'replace_this_with_a_long_random_secret') {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in backend/.env');
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const api = require('./routes/api');
const errorHandler = require('./middleware/errors');
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*'}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.get('/api/health', (req,res)=>res.json({status:'ok', app:'ShopEase API'}));
app.use('/api', api);
app.use(errorHandler);
const port = process.env.PORT || 5000;
app.listen(port, ()=>console.log(`ShopEase API running on http://localhost:${port}`));
