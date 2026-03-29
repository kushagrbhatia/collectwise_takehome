const Database = require('better-sqlite3');
const path = require('path');

let _db = null;

function open(dbPath) {
  _db = new Database(dbPath || path.join(process.cwd(), 'collectwise.db'));
  return _db;
}

function get() {
  if (!_db) throw new Error('Database not open. Call open() first.');
  return _db;
}

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { open, get, close };
