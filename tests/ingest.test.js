const { newDb } = require('pg-mem');
const initSchema = require('../db/schema');
const { runIngestion } = require('../scripts/ingest');

function makePool() {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool();
}

describe('runIngestion', () => {
  let pool;

  beforeEach(async () => {
    pool = makePool();
    await initSchema(pool);
  });

  afterEach(async () => {
    await pool.end();
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

  test('inserts a new record', async () => {
    const stats = await runIngestion(pool, makeRows());
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.errored).toBe(0);
    const row = (await pool.query('SELECT * FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    expect(row).toBeDefined();
    expect(row.debtor_name).toBe('John Doe');
    expect(row.balance).toBe(100);
    expect(row.inbound).toBe(1);
    expect(row.phone_number).toBe('555-1234');
  });

  test('skips identical record on re-run', async () => {
    await runIngestion(pool, makeRows());
    const stats = await runIngestion(pool, makeRows());
    expect(stats.inserted).toBe(0);
    expect(stats.skipped).toBe(1);
    const count = (await pool.query('SELECT COUNT(*) AS n FROM archived_debtors')).rows[0].n;
    expect(Number(count)).toBe(0);
  });

  test('archives old record and updates when data changes', async () => {
    await runIngestion(pool, makeRows());
    const stats = await runIngestion(pool, makeRows({ balance: '200.00' }));
    expect(stats.updated).toBe(1);
    expect(stats.inserted).toBe(0);
    const current = (await pool.query('SELECT * FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    expect(current.balance).toBe(200);
    const archived = (await pool.query('SELECT * FROM archived_debtors WHERE account_number = $1', ['ACC001'])).rows;
    expect(archived).toHaveLength(1);
    expect(archived[0].balance).toBe(100);
    expect(archived[0].archived_at).toBeDefined();
  });

  test('skips row with missing account_number and increments errored', async () => {
    const stats = await runIngestion(pool, makeRows({ account_number: '' }));
    expect(stats.errored).toBe(1);
    const count = (await pool.query('SELECT COUNT(*) AS n FROM debtors')).rows[0].n;
    expect(Number(count)).toBe(0);
  });

  test('skips row with non-numeric balance', async () => {
    const stats = await runIngestion(pool, makeRows({ balance: 'bad' }));
    expect(stats.errored).toBe(1);
    const count = (await pool.query('SELECT COUNT(*) AS n FROM debtors')).rows[0].n;
    expect(Number(count)).toBe(0);
  });

  test('inserts row with negative balance — warning only', async () => {
    const stats = await runIngestion(pool, makeRows({ balance: '-50' }));
    expect(stats.inserted).toBe(1);
    expect(stats.errored).toBe(0);
    const row = (await pool.query('SELECT * FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    expect(row.balance).toBe(-50);
  });

  test('last occurrence wins for intra-CSV duplicates', async () => {
    const rows = [
      ...makeRows({ balance: '100' }),
      ...makeRows({ balance: '200' }),
    ];
    const stats = await runIngestion(pool, rows);
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(1);
    const row = (await pool.query('SELECT * FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    expect(row.balance).toBe(200);
  });

  test('missing phone_number stored as null', async () => {
    await runIngestion(pool, makeRows({ phone_number: '' }));
    const row = (await pool.query('SELECT * FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    expect(row.phone_number).toBeNull();
  });

  test('preserves created_at across updates', async () => {
    await runIngestion(pool, makeRows());
    const before = (await pool.query('SELECT created_at FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    await runIngestion(pool, makeRows({ balance: '999' }));
    const after = (await pool.query('SELECT created_at FROM debtors WHERE account_number = $1', ['ACC001'])).rows[0];
    expect(before.created_at).toBe(after.created_at);
  });
});
