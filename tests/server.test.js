const request = require('supertest');
const db = require('../db/database');
const initSchema = require('../db/schema');
const { createApp } = require('../server');

describe('GET /accounts/:accountNumber', () => {
  let app;

  beforeAll(() => {
    const conn = db.open(':memory:');
    initSchema(conn);
    const now = new Date().toISOString();
    conn.prepare(
      `INSERT INTO debtors (account_number, debtor_name, phone_number, balance, status, client_name, entry_date, inbound, outbound, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('ACC001', 'John Doe', '555-1234', 1500.00, 'active', 'Atlas Recovery', '2024-01-15', 1, 0, now, now);
    app = createApp(conn);
  });

  afterAll(() => {
    db.close();
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
