const db = require('../db/database');
const initSchema = require('../db/schema');
const { runIngestion } = require('../scripts/ingest');

describe('runIngestion', () => {
  let conn;

  beforeEach(() => {
    conn = db.open(':memory:');
    initSchema(conn);
  });

  afterEach(() => {
    db.close();
  });

  function makeRows(overrides = {}) {
    return [Object.assign({
      account_number: 'ACC001',
      debtor_name: 'John Doe',
      phone_number: '555-1234',
      balance: '100.00',
      status: 'active',
      client_name: 'Atlas Recovery',
      entry_date: '2024-01-15',
      inbound: '1',
      outbound: '0',
    }, overrides)];
  }

  test('inserts a new record', () => {
    const stats = runIngestion(conn, makeRows());
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.errored).toBe(0);
    const row = conn.prepare('SELECT * FROM debtors WHERE account_number = ?').get('ACC001');
    expect(row).toBeDefined();
    expect(row.debtor_name).toBe('John Doe');
    expect(row.balance).toBe(100);
    expect(row.inbound).toBe(1);
    expect(row.phone_number).toBe('555-1234');
  });

  test('skips identical record on re-run', () => {
    runIngestion(conn, makeRows());
    const stats = runIngestion(conn, makeRows());
    expect(stats.inserted).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(conn.prepare('SELECT COUNT(*) AS n FROM archived_debtors').get().n).toBe(0);
  });

  test('archives old record and updates when data changes', () => {
    runIngestion(conn, makeRows());
    const stats = runIngestion(conn, makeRows({ balance: '200.00' }));
    expect(stats.updated).toBe(1);
    expect(stats.inserted).toBe(0);
    const current = conn.prepare('SELECT * FROM debtors WHERE account_number = ?').get('ACC001');
    expect(current.balance).toBe(200);
    const archived = conn.prepare('SELECT * FROM archived_debtors WHERE account_number = ?').all('ACC001');
    expect(archived).toHaveLength(1);
    expect(archived[0].balance).toBe(100);
    expect(archived[0].archived_at).toBeDefined();
  });

  test('skips row with missing account_number and increments errored', () => {
    const stats = runIngestion(conn, makeRows({ account_number: '' }));
    expect(stats.errored).toBe(1);
    expect(conn.prepare('SELECT COUNT(*) AS n FROM debtors').get().n).toBe(0);
  });

  test('skips row with non-numeric balance', () => {
    const stats = runIngestion(conn, makeRows({ balance: 'bad' }));
    expect(stats.errored).toBe(1);
    expect(conn.prepare('SELECT COUNT(*) AS n FROM debtors').get().n).toBe(0);
  });

  test('inserts row with negative balance — warning only', () => {
    const stats = runIngestion(conn, makeRows({ balance: '-50' }));
    expect(stats.inserted).toBe(1);
    expect(stats.errored).toBe(0);
    const row = conn.prepare('SELECT * FROM debtors WHERE account_number = ?').get('ACC001');
    expect(row.balance).toBe(-50);
  });

  test('last occurrence wins for intra-CSV duplicates', () => {
    const rows = [
      ...makeRows({ balance: '100' }),
      ...makeRows({ balance: '200' }),
    ];
    const stats = runIngestion(conn, rows);
    // First row inserted, second triggers update (balance changed)
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(1);
    const row = conn.prepare('SELECT * FROM debtors WHERE account_number = ?').get('ACC001');
    expect(row.balance).toBe(200);
  });

  test('missing phone_number stored as null', () => {
    runIngestion(conn, makeRows({ phone_number: '' }));
    const row = conn.prepare('SELECT * FROM debtors WHERE account_number = ?').get('ACC001');
    expect(row.phone_number).toBeNull();
  });

  test('preserves created_at across updates', () => {
    runIngestion(conn, makeRows());
    const before = conn.prepare('SELECT created_at FROM debtors WHERE account_number = ?').get('ACC001');
    runIngestion(conn, makeRows({ balance: '999' }));
    const after = conn.prepare('SELECT created_at FROM debtors WHERE account_number = ?').get('ACC001');
    expect(before.created_at).toBe(after.created_at);
  });
});
