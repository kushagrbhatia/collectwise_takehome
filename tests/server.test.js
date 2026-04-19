const request = require('supertest');
const { newDb } = require('pg-mem');
const initSchema = require('../db/schema');
const { createApp } = require('../server');

function makePool() {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool();
}

describe('GET /accounts/:accountNumber', () => {
  let app;
  let pool;

  beforeAll(async () => {
    pool = makePool();
    await initSchema(pool);
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO debtors (account_number, debtor_name, phone_number, balance, status, client_name, entry_date, inbound, outbound, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ['ACC001', 'John Doe', '555-1234', 1500.00, 'active', 'Atlas Recovery', '2024-01-15', 1, 0, now, now]
    );
    app = createApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('returns 200 with account fields for existing account', async () => {
    const res = await request(app).get('/accounts/ACC001');
    expect(res.status).toBe(200);
    expect(res.body.account_number).toBe('ACC001');
    expect(res.body.debtor_name).toBe('John Doe');
    expect(res.body.phone_number).toBe('555-1234');
    expect(res.body.balance).toBe(1500);
    expect(res.body.status).toBe('active');
    expect(res.body.client_name).toBe('Atlas Recovery');
  });

  test('returns 404 with error for non-existent account', async () => {
    const res = await request(app).get('/accounts/NOTEXIST');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Account not found');
    expect(res.body.account_number).toBe('NOTEXIST');
  });
});

describe('POST /ingest', () => {
  let app;
  let pool;

  beforeEach(async () => {
    pool = makePool();
    await initSchema(pool);
    app = createApp(pool);
  });

  afterEach(async () => {
    await pool.end();
  });

  function makeCSV(rows = []) {
    const header = 'account_number,debtor_name,phone_number,balance,status,client_name,entry_date,inbound,outbound';
    return [header, ...rows].join('\n');
  }

  test('returns 200 with stats for valid CSV', async () => {
    const csv = makeCSV(['ACC999,Test User,555-0000,500.00,active,Test Client,2024-01-01,1,0']);
    const res = await request(app)
      .post('/ingest')
      .attach('file', Buffer.from(csv), 'test.csv');
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errored).toBe(0);
  });

  test('returns 400 when no file provided', async () => {
    const res = await request(app).post('/ingest');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  test('returns stats with errored count for invalid rows', async () => {
    const csv = makeCSV(['ACC001,,555-1234,100,active,Client,2024-01-01,1,0']);
    const res = await request(app)
      .post('/ingest')
      .attach('file', Buffer.from(csv), 'test.csv');
    expect(res.status).toBe(200);
    expect(res.body.errored).toBe(1);
    expect(res.body.inserted).toBe(0);
  });

  test('inserted data is queryable via GET /accounts/:id', async () => {
    const csv = makeCSV(['ACC777,Jane Smith,555-9999,250.00,pending,Test Corp,2024-06-01,0,1']);
    await request(app).post('/ingest').attach('file', Buffer.from(csv), 'test.csv');
    const res = await request(app).get('/accounts/ACC777');
    expect(res.status).toBe(200);
    expect(res.body.debtor_name).toBe('Jane Smith');
  });
});
