const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'jblr-mvp-productivo-1',
});

pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

module.exports = { pool };
