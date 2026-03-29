const db = require('../db/database');

describe('database', () => {
  afterEach(() => {
    db.close();
  });

  test('open returns a working SQLite connection', () => {
    const conn = db.open(':memory:');
    expect(conn).toBeDefined();
    const result = conn.prepare('SELECT 1 AS val').get();
    expect(result.val).toBe(1);
  });

  test('get returns the same connection after open', () => {
    const conn = db.open(':memory:');
    expect(db.get()).toBe(conn);
  });

  test('get throws if not opened', () => {
    expect(() => db.get()).toThrow('Database not open');
  });

  test('close cleans up so get throws afterward', () => {
    db.open(':memory:');
    db.close();
    expect(() => db.get()).toThrow('Database not open');
  });
});
