const { Pool } = require('pg');

let _pool = null;

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  _pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  return _pool;
}

async function close() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

module.exports = { createPool, close };
