# PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite with Railway PostgreSQL and add a `POST /ingest` endpoint so CSV data can be pushed to the live DB without a git push.

**Architecture:** Swap `better-sqlite3` for `pg` (node-postgres); all DB calls become async/await. A `POST /ingest` endpoint accepts a multipart CSV upload, validates and upserts rows, and returns stats. Tests use `pg-mem` (in-memory PostgreSQL) as a drop-in replacement for SQLite `:memory:`.

**Tech Stack:** Node.js ≥18, Express 5, `pg`, `multer`, `dotenv` (dev), `pg-mem` (test)

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `pg`, `multer`, `dotenv`; add `pg-mem` to devDeps; remove `better-sqlite3` |
| `db/database.js` | Replace better-sqlite3 singleton with `pg.Pool`; export `createPool()` and `close()` |
| `db/schema.js` | Rewrite DDL for PostgreSQL; `initSchema(pool)` becomes async |
| `scripts/ingest.js` | Make `runIngestion(pool, rows)` async; use `pool.query()` and manual transactions |
| `server.js` | Make GET route async; add `POST /ingest` with multer |
| `scripts/start.js` | Load dotenv; remove CSV seeding; async startup |
| `tests/database.test.js` | Test `createPool()` throws when `DATABASE_URL` missing |
| `tests/schema.test.js` | Rewrite with pg-mem; replace PRAGMA with information_schema |
| `tests/ingest.test.js` | Rewrite with pg-mem; all tests async |
| `tests/server.test.js` | Rewrite with pg-mem; add POST /ingest tests |
| `tests/validate.test.js` | No changes |

---

## Task 1: Update dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new packages and remove old one**

```bash
cd "CollectWise Take Home"
npm install pg multer dotenv
npm install --save-dev pg-mem
npm uninstall better-sqlite3
```

Expected: no errors; `node_modules/pg`, `node_modules/multer`, `node_modules/dotenv`, `node_modules/pg-mem` all present.

- [ ] **Step 2: Verify package.json reflects changes**

```bash
node -e "const p = require('./package.json'); console.log(Object.keys(p.dependencies).sort().join(', '))"
```

Expected output contains: `csv-parse, dotenv, express, multer, pg`
Does NOT contain: `better-sqlite3`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap better-sqlite3 for pg, add multer and dotenv"
```

---

## Task 2: Rewrite `db/database.js`

**Files:**
- Modify: `db/database.js`
- Test: `tests/database.test.js`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/database.test.js` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=tests/database
```

Expected: FAIL — `createPool is not a function` or similar.

- [ ] **Step 3: Rewrite `db/database.js`**

Replace the entire file:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern=tests/database
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add db/database.js tests/database.test.js
git commit -m "feat: replace better-sqlite3 with pg Pool in db/database.js"
```

---

## Task 3: Rewrite `db/schema.js`

**Files:**
- Modify: `db/schema.js`
- Test: `tests/schema.test.js`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/schema.test.js` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=tests/schema
```

Expected: FAIL — `initSchema is not async` or table doesn't exist.

- [ ] **Step 3: Rewrite `db/schema.js`**

Replace the entire file:

```js
async function initSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debtors (
      id             SERIAL          PRIMARY KEY,
      account_number TEXT            UNIQUE NOT NULL,
      debtor_name    TEXT            NOT NULL,
      phone_number   TEXT,
      balance        DOUBLE PRECISION NOT NULL,
      status         TEXT            NOT NULL,
      client_name    TEXT            NOT NULL,
      entry_date     TEXT,
      inbound        SMALLINT        NOT NULL DEFAULT 0,
      outbound       SMALLINT        NOT NULL DEFAULT 0,
      created_at     TEXT            NOT NULL,
      updated_at     TEXT            NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debtors_account_number ON debtors(account_number)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_debtors_phone_number ON debtors(phone_number)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS archived_debtors (
      id             SERIAL          PRIMARY KEY,
      account_number TEXT            NOT NULL,
      debtor_name    TEXT            NOT NULL,
      phone_number   TEXT,
      balance        DOUBLE PRECISION NOT NULL,
      status         TEXT            NOT NULL,
      client_name    TEXT            NOT NULL,
      entry_date     TEXT,
      inbound        SMALLINT        NOT NULL DEFAULT 0,
      outbound       SMALLINT        NOT NULL DEFAULT 0,
      created_at     TEXT            NOT NULL,
      updated_at     TEXT            NOT NULL,
      archived_at    TEXT            NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_archived_debtors_account_number ON archived_debtors(account_number)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_archived_debtors_phone_number ON archived_debtors(phone_number)
  `);
}

module.exports = initSchema;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern=tests/schema
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add db/schema.js tests/schema.test.js
git commit -m "feat: rewrite schema for PostgreSQL"
```

---

## Task 4: Rewrite `scripts/ingest.js`

**Files:**
- Modify: `scripts/ingest.js`
- Test: `tests/ingest.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/ingest.test.js` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=tests/ingest
```

Expected: FAIL — `runIngestion` is not async / TypeError.

- [ ] **Step 3: Rewrite `scripts/ingest.js`**

Replace the entire file:

```js
const { validateRow } = require('./validate');

const BUSINESS_COLS = [
  'debtor_name', 'phone_number', 'balance', 'status',
  'client_name', 'entry_date', 'inbound', 'outbound',
];

function hasChanged(existing, incoming) {
  return BUSINESS_COLS.some(col => {
    const a = existing[col] == null ? null : existing[col];
    const b = incoming[col] == null ? null : incoming[col];
    return String(a) !== String(b);
  });
}

async function runIngestion(pool, rows) {
  const now = new Date().toISOString();
  const stats = { inserted: 0, updated: 0, skipped: 0, errored: 0 };
  const seenInFile = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rawAcct = row.account_number && row.account_number.trim();
    if (rawAcct) {
      if (seenInFile.has(rawAcct)) {
        console.warn(`Row ${rowNum}: duplicate account_number "${rawAcct}" in this file (also row ${seenInFile.get(rawAcct)}), last occurrence wins`);
      }
      seenInFile.set(rawAcct, rowNum);
    }

    const { errors, warnings, parsed } = validateRow(row, rowNum);
    warnings.forEach(w => console.warn(w));

    if (errors.length > 0) {
      errors.forEach(e => console.error(e));
      stats.errored++;
      continue;
    }

    const existing = (await pool.query(
      'SELECT * FROM debtors WHERE account_number = $1',
      [parsed.account_number]
    )).rows[0];

    if (!existing) {
      await pool.query(
        `INSERT INTO debtors
           (account_number, debtor_name, phone_number, balance, status, client_name,
            entry_date, inbound, outbound, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [parsed.account_number, parsed.debtor_name, parsed.phone_number, parsed.balance,
         parsed.status, parsed.client_name, parsed.entry_date, parsed.inbound,
         parsed.outbound, now, now]
      );
      stats.inserted++;
    } else if (hasChanged(existing, parsed)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO archived_debtors
             (account_number, debtor_name, phone_number, balance, status, client_name,
              entry_date, inbound, outbound, created_at, updated_at, archived_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [existing.account_number, existing.debtor_name, existing.phone_number,
           existing.balance, existing.status, existing.client_name, existing.entry_date,
           existing.inbound, existing.outbound, existing.created_at, existing.updated_at, now]
        );
        await client.query(
          `UPDATE debtors
           SET debtor_name=$1, phone_number=$2, balance=$3, status=$4, client_name=$5,
               entry_date=$6, inbound=$7, outbound=$8, updated_at=$9
           WHERE account_number=$10`,
          [parsed.debtor_name, parsed.phone_number, parsed.balance, parsed.status,
           parsed.client_name, parsed.entry_date, parsed.inbound, parsed.outbound,
           now, parsed.account_number]
        );
        await client.query('COMMIT');
        stats.updated++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

module.exports = { runIngestion, hasChanged };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern=tests/ingest
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest.js tests/ingest.test.js
git commit -m "feat: make runIngestion async for PostgreSQL"
```

---

## Task 5: Rewrite `server.js`

**Files:**
- Modify: `server.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/server.test.js` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=tests/server
```

Expected: FAIL — `POST /ingest` route doesn't exist, GET route may fail on async.

- [ ] **Step 3: Rewrite `server.js`**

Replace the entire file:

```js
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { runIngestion } = require('./scripts/ingest');

const upload = multer({ storage: multer.memoryStorage() });

function createApp(pool) {
  const app = express();

  app.get('/accounts/:accountNumber', async (req, res) => {
    const result = await pool.query(
      `SELECT account_number, debtor_name, phone_number, balance, status, client_name
       FROM debtors WHERE account_number = $1`,
      [req.params.accountNumber]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({
        error: 'Account not found',
        account_number: req.params.accountNumber,
      });
    }
    res.json(row);
  });

  app.post('/ingest', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
      const content = req.file.buffer.toString('utf8');
      const rows = parse(content, { columns: true, skip_empty_lines: true });
      const stats = await runIngestion(pool, rows);
      res.json(stats);
    } catch (err) {
      if (err.code && err.code.startsWith('CSV_')) {
        return res.status(400).json({ error: `Invalid CSV: ${err.message}` });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern=tests/server
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server.js tests/server.test.js
git commit -m "feat: async GET route and POST /ingest endpoint"
```

---

## Task 6: Rewrite `scripts/start.js`

**Files:**
- Modify: `scripts/start.js`

- [ ] **Step 1: Rewrite `scripts/start.js`**

Replace the entire file:

```js
require('dotenv').config();

const db = require('../db/database');
const initSchema = require('../db/schema');
const { createApp } = require('../server');

const PORT = process.env.PORT || 3000;

async function main() {
  const pool = db.createPool();
  await initSchema(pool);
  const app = createApp(pool);
  const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
  process.on('SIGTERM', () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

main().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Test startup locally**

```bash
npm start
```

Expected output:
```
Server listening on port 3000
```

No errors. If you see `DATABASE_URL environment variable is not set`, make sure `.env` exists with a valid `DATABASE_URL`.

- [ ] **Step 3: In a second terminal, ingest the CSV**

```bash
curl -s -F "file=@atlas_inventory.csv" http://localhost:3000/ingest
```

Expected: `{"inserted":4,"updated":0,"skipped":0,"errored":2}` (ACC004 and ACC012 error as before)

- [ ] **Step 4: Verify ACC100 is queryable**

```bash
curl -s http://localhost:3000/accounts/ACC100
```

Expected:
```json
{"account_number":"ACC100","debtor_name":"Kushagr Bhatia","phone_number":"732-823-9328","balance":100,"status":"active","client_name":"Atlas Recovery"}
```

- [ ] **Step 5: Stop the server (Ctrl+C), run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/start.js
git commit -m "feat: async startup, load dotenv, remove CSV seeding"
```

---

## Task 7: Commit the CSV update and push to Railway

**Files:**
- Modify: `atlas_inventory.csv` (already modified — ACC100 row added)

- [ ] **Step 1: Commit the CSV and push everything**

```bash
git add atlas_inventory.csv .gitignore
git push origin main
```

- [ ] **Step 2: Watch Railway redeploy**

Open the Railway dashboard and watch the deployment logs. Expected to see:
```
Server listening on port <PORT>
```
No startup errors.

- [ ] **Step 3: Ingest the CSV against production**

```bash
curl -s -F "file=@atlas_inventory.csv" https://collectwisetakehome-production.up.railway.app/ingest
```

Expected: `{"inserted":4,"updated":0,"skipped":0,"errored":2}`

- [ ] **Step 4: Verify ACC100 is live**

```bash
curl -s https://collectwisetakehome-production.up.railway.app/accounts/ACC100
```

Expected:
```json
{"account_number":"ACC100","debtor_name":"Kushagr Bhatia","phone_number":"732-823-9328","balance":100,"status":"active","client_name":"Atlas Recovery"}
```
