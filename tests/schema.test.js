const db = require('../db/database');
const initSchema = require('../db/schema');

describe('schema', () => {
  let conn;

  beforeEach(() => {
    conn = db.open(':memory:');
    initSchema(conn);
  });

  afterEach(() => {
    db.close();
  });

  test('debtors table exists with expected columns', () => {
    const info = conn.prepare("PRAGMA table_info('debtors')").all();
    const cols = info.map(r => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'account_number', 'debtor_name', 'phone_number',
      'balance', 'status', 'client_name', 'entry_date',
      'inbound', 'outbound', 'created_at', 'updated_at'
    ]));
  });

  test('archived_debtors table exists with expected columns', () => {
    const info = conn.prepare("PRAGMA table_info('archived_debtors')").all();
    const cols = info.map(r => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'account_number', 'debtor_name', 'phone_number',
      'balance', 'status', 'client_name', 'entry_date',
      'inbound', 'outbound', 'created_at', 'updated_at', 'archived_at'
    ]));
  });

  test('debtors has unique constraint on account_number', () => {
    const now = new Date().toISOString();
    conn.prepare(`INSERT INTO debtors (account_number, debtor_name, balance, status, client_name, created_at, updated_at) VALUES ('ACC001', 'Test', 100, 'active', 'Client', ?, ?)`).run(now, now);
    expect(() => {
      conn.prepare(`INSERT INTO debtors (account_number, debtor_name, balance, status, client_name, created_at, updated_at) VALUES ('ACC001', 'Test2', 200, 'active', 'Client', ?, ?)`).run(now, now);
    }).toThrow();
  });

  test('initSchema is idempotent — safe to call twice', () => {
    expect(() => initSchema(conn)).not.toThrow();
  });
});
