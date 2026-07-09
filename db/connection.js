const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'clinicuser',
  password: process.env.DB_PASSWORD || 'clinicpass123',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'clinicdb',
});

module.exports = pool;