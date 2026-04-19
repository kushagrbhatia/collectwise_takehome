const { Pool } = require('pg');

let _pool = null;

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

function close() {
  if (_pool) {
    _pool.end();
    _pool = null;
  }
}

module.exports = { createPool, close };
