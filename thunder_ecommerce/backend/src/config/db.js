const mysql = require('mysql2/promise');
require('dotenv').config();

const production = process.env.NODE_ENV === 'production';
const host = process.env.DB_HOST || 'localhost';
if (production && !process.env.DB_PORT) {
  throw new Error('Set DB_PORT to the hosted MySQL service port in production');
}
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const database = process.env.DB_NAME || 'shop_ease';
const password = process.env.DB_PASSWORD || '';
const sslEnabled = process.env.DB_SSL === 'true';
const sslCa = process.env.DB_SSL_CA;

if (production) {
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    .filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing production database environment variables: ${missing.join(', ')}`);
  }
  if (['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
    throw new Error('Production DB_HOST must be the hostname of the remote MySQL server');
  }
  if (!sslEnabled) {
    throw new Error('Set DB_SSL=true in production to require verified MySQL TLS');
  }
}
if (process.env.DB_SSL && !['true', 'false'].includes(process.env.DB_SSL)) {
  throw new Error('DB_SSL must be set to true or false');
}
if (sslCa && !sslEnabled) {
  throw new Error('DB_SSL_CA can only be used when DB_SSL=true');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT must be a valid TCP port');
}

const pool = mysql.createPool({
  host, port, user, password, database,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  ...(sslEnabled ? {
    ssl: {
      rejectUnauthorized: true,
      ...(sslCa ? { ca: sslCa } : {})
    }
  } : {})
});
module.exports = pool;
