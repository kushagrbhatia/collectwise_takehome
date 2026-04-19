const { newDb } = require('pg-mem');
const initSchema = require('../db/schema');

function makePool() {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool();
}

describe('schema', () => {
  let pool;

  beforeEach(() => {
    pool = makePool();
  });

  afterEach(async () => {
    await pool.end();
  });

  test('debtors table exists with expected columns', async () => {
    await initSchema(pool);
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'debtors'`
    );
    const cols = result.rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'account_number', 'debtor_name', 'phone_number',
      'balance', 'status', 'client_name', 'entry_date',
      'inbound', 'outbound', 'created_at', 'updated_at',
    ]));
  });

  test('archived_debtors table exists with expected columns', async () => {
    await initSchema(pool);
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'archived_debtors'`
    );
    const cols = result.rows.map(r => r.column_name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'account_number', 'debtor_name', 'phone_number',
      'balance', 'status', 'client_name', 'entry_date',
      'inbound', 'outbound', 'created_at', 'updated_at', 'archived_at',
    ]));
  });

  test('debtors has unique constraint on account_number', async () => {
    await initSchema(pool);
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO debtors (account_number, debtor_name, balance, status, client_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['ACC001', 'Test', 100, 'active', 'Client', now, now]
    );
    await expect(
      pool.query(
        `INSERT INTO debtors (account_number, debtor_name, balance, status, client_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['ACC001', 'Test2', 200, 'active', 'Client', now, now]
      )
    ).rejects.toThrow();
  });

  test('initSchema is idempotent — safe to call twice', async () => {
    await initSchema(pool);
    await expect(initSchema(pool)).resolves.not.toThrow();
  });
});
