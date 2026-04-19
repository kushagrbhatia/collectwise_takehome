const db = require('../db/database');

describe('database', () => {
  afterEach(() => {
    db.close();
  });

  test('createPool throws when DATABASE_URL is not set', () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(() => db.createPool()).toThrow('DATABASE_URL');
    process.env.DATABASE_URL = original;
  });

  test('createPool returns a Pool when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
    const pool = db.createPool();
    expect(pool).toBeDefined();
    expect(typeof pool.query).toBe('function');
    expect(typeof pool.connect).toBe('function');
  });

  test('close is safe to call multiple times', () => {
    process.env.DATABASE_URL = 'postgresql://fake:fake@localhost:5432/fake';
    db.createPool();
    expect(() => { db.close(); db.close(); }).not.toThrow();
  });
});
