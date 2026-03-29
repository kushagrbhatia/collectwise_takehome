# CSV Ingestion Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Node.js script that ingests `atlas_inventory.csv` into a SQLite database with validation, change-detection upserts, and historical archiving.

**Architecture:** Four modules — `db/database.js` (connection singleton), `db/schema.js` (DDL), `scripts/validate.js` (per-row validation), and `scripts/ingest.js` (main entry point + ingestion loop). All business logic lives in small, independently testable units.

**Tech Stack:** Node.js, better-sqlite3, csv-parse, Jest (testing)

---

## File Map

| File | Purpose |
|------|---------|
| `package.json` | npm config, `ingest` script, dependencies |
| `.gitignore` | Exclude node_modules and db file |
| `db/database.js` | Open/get/close SQLite connection (singleton) |
| `db/schema.js` | CREATE TABLE & index statements |
| `scripts/validate.js` | Validate one CSV row — returns errors, warnings, parsed fields |
| `scripts/ingest.js` | Main: parse args, read CSV, run ingestion loop; exports `runIngestion` for tests |
| `atlas_inventory.csv` | Sample input file |
| `README.md` | Setup and usage docs |
| `tests/database.test.js` | Unit tests for database.js |
| `tests/schema.test.js` | Unit tests for schema.js |
| `tests/validate.test.js` | Unit tests for validate.js |
| `tests/ingest.test.js` | Integration tests for full ingestion flow |

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "collectwise-take-home",
  "version": "1.0.0",
  "scripts": {
    "ingest": "node scripts/ingest.js",
    "test": "jest"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "csv-parse": "^5.5.3"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
collectwise.db
*.db
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` created. No errors.

- [ ] **Step 4: Commit**

```bash
git init
git add package.json package-lock.json .gitignore
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Database Connection Module

**Files:**
- Create: `db/database.js`
- Create: `tests/database.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/database.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/database.test.js --no-coverage
```

Expected: FAIL with `Cannot find module '../db/database'`

- [ ] **Step 3: Create db/database.js**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/database.test.js --no-coverage
```

Expected: PASS, 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add db/database.js tests/database.test.js
git commit -m "feat: add database connection module"
```

---

### Task 3: Schema Module

**Files:**
- Create: `db/schema.js`
- Create: `tests/schema.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/schema.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/schema.test.js --no-coverage
```

Expected: FAIL with `Cannot find module '../db/schema'`

- [ ] **Step 3: Create db/schema.js**

```javascript
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS debtors (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT    UNIQUE NOT NULL,
      debtor_name    TEXT    NOT NULL,
      phone_number   TEXT,
      balance        REAL    NOT NULL,
      status         TEXT    NOT NULL,
      client_name    TEXT    NOT NULL,
      entry_date     TEXT,
      inbound        INTEGER NOT NULL DEFAULT 0,
      outbound       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_debtors_account_number ON debtors(account_number);
    CREATE INDEX IF NOT EXISTS idx_debtors_phone_number   ON debtors(phone_number);

    CREATE TABLE IF NOT EXISTS archived_debtors (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT    NOT NULL,
      debtor_name    TEXT    NOT NULL,
      phone_number   TEXT,
      balance        REAL    NOT NULL,
      status         TEXT    NOT NULL,
      client_name    TEXT    NOT NULL,
      entry_date     TEXT,
      inbound        INTEGER NOT NULL DEFAULT 0,
      outbound       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL,
      archived_at    TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_archived_debtors_account_number ON archived_debtors(account_number);
  `);
}

module.exports = initSchema;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/schema.test.js --no-coverage
```

Expected: PASS, 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add db/schema.js tests/schema.test.js
git commit -m "feat: add schema module with debtors and archived_debtors tables"
```

---

### Task 4: Validation Module

**Files:**
- Create: `scripts/validate.js`
- Create: `tests/validate.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/validate.test.js`:

```javascript
const { validateRow } = require('../scripts/validate');

describe('validateRow', () => {
  function baseRow() {
    return {
      account_number: 'ACC001',
      debtor_name: 'John Doe',
      phone_number: '555-1234',
      balance: '100.00',
      status: 'active',
      client_name: 'Atlas Recovery',
      entry_date: '2024-01-15',
      inbound: '1',
      outbound: '0',
    };
  }

  test('valid row returns no errors or warnings', () => {
    const result = validateRow(baseRow(), 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.parsed.balance).toBe(100);
    expect(result.parsed.entry_date).toBe('2024-01-15');
    expect(result.parsed.inbound).toBe(1);
    expect(result.parsed.outbound).toBe(0);
  });

  test('missing account_number is a hard error', () => {
    const row = baseRow();
    row.account_number = '';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/account_number/);
  });

  test('whitespace-only debtor_name is a hard error', () => {
    const row = baseRow();
    row.debtor_name = '   ';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/debtor_name/);
  });

  test('non-numeric balance is a hard error', () => {
    const row = baseRow();
    row.balance = 'not-a-number';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/balance/);
  });

  test('missing status is a hard error', () => {
    const row = baseRow();
    row.status = '';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/status/);
  });

  test('missing client_name is a hard error', () => {
    const row = baseRow();
    row.client_name = '';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/client_name/);
  });

  test('negative balance produces warning but no error', () => {
    const row = baseRow();
    row.balance = '-50';
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/negative/i);
    expect(result.parsed.balance).toBe(-50);
  });

  test('missing phone_number stored as null', () => {
    const row = baseRow();
    delete row.phone_number;
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed.phone_number).toBeNull();
  });

  test('invalid entry_date format produces warning and stores null', () => {
    const row = baseRow();
    row.entry_date = '01/15/2024';
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/entry_date/);
    expect(result.parsed.entry_date).toBeNull();
  });

  test('missing entry_date stores null without warning', () => {
    const row = baseRow();
    delete row.entry_date;
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.parsed.entry_date).toBeNull();
  });

  test('invalid inbound value defaults to 0', () => {
    const row = baseRow();
    row.inbound = 'yes';
    const result = validateRow(row, 2);
    expect(result.parsed.inbound).toBe(0);
  });

  test('missing outbound defaults to 0', () => {
    const row = baseRow();
    delete row.outbound;
    const result = validateRow(row, 2);
    expect(result.parsed.outbound).toBe(0);
  });

  test('includes row number in error messages', () => {
    const row = baseRow();
    row.account_number = '';
    const result = validateRow(row, 5);
    expect(result.errors[0]).toMatch(/5/);
  });

  test('includes account_number in error messages when available', () => {
    const row = baseRow();
    row.balance = 'bad';
    const result = validateRow(row, 3);
    expect(result.errors[0]).toMatch(/ACC001/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/validate.test.js --no-coverage
```

Expected: FAIL with `Cannot find module '../scripts/validate'`

- [ ] **Step 3: Create scripts/validate.js**

```javascript
function validateRow(row, rowNum) {
  const errors = [];
  const warnings = [];
  const acct = row.account_number && row.account_number.trim();

  function loc() {
    return acct ? `Row ${rowNum} [${acct}]` : `Row ${rowNum}`;
  }

  // Required string fields
  if (!row.account_number || !row.account_number.trim()) {
    errors.push(`Row ${rowNum}: missing or empty account_number`);
  }
  if (!row.debtor_name || !row.debtor_name.trim()) {
    errors.push(`${loc()}: missing or empty debtor_name`);
  }
  if (!row.status || !row.status.trim()) {
    errors.push(`${loc()}: missing or empty status`);
  }
  if (!row.client_name || !row.client_name.trim()) {
    errors.push(`${loc()}: missing or empty client_name`);
  }

  // Balance — required numeric
  const balance = parseFloat(row.balance);
  if (row.balance === undefined || row.balance === '' || isNaN(balance)) {
    errors.push(`${loc()}: balance is not numeric: "${row.balance}"`);
  } else if (balance < 0) {
    warnings.push(`${loc()}: negative balance ${balance}`);
  }

  // phone_number — optional, null if missing or empty
  const phone_number = (row.phone_number && row.phone_number.trim()) || null;

  // entry_date — optional, null if missing or invalid YYYY-MM-DD format
  let entry_date = null;
  if (row.entry_date && row.entry_date.trim()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date.trim())) {
      entry_date = row.entry_date.trim();
    } else {
      warnings.push(`${loc()}: invalid entry_date format "${row.entry_date}", storing NULL`);
    }
  }

  // inbound / outbound — default 0 if missing or not exactly 0/1
  const inbound = (row.inbound === '1' || row.inbound === 1) ? 1 : 0;
  const outbound = (row.outbound === '1' || row.outbound === 1) ? 1 : 0;

  const parsed = {
    account_number: acct || null,
    debtor_name: row.debtor_name ? row.debtor_name.trim() : null,
    phone_number,
    balance: isNaN(balance) ? null : balance,
    status: row.status ? row.status.trim() : null,
    client_name: row.client_name ? row.client_name.trim() : null,
    entry_date,
    inbound,
    outbound,
  };

  return { errors, warnings, parsed };
}

module.exports = { validateRow };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest tests/validate.test.js --no-coverage
```

Expected: PASS, 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.js tests/validate.test.js
git commit -m "feat: add row validation module with all spec rules"
```

---

### Task 5: Main Ingestion Script

**Files:**
- Create: `scripts/ingest.js`
- Create: `tests/ingest.test.js`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/ingest.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/ingest.test.js --no-coverage
```

Expected: FAIL with `Cannot find module '../scripts/ingest'`

- [ ] **Step 3: Create scripts/ingest.js**

```javascript
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
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

function runIngestion(db, rows) {
  const now = new Date().toISOString();
  const stats = { inserted: 0, updated: 0, skipped: 0, errored: 0 };
  const seenInFile = new Map();

  const selectStmt = db.prepare(
    'SELECT * FROM debtors WHERE account_number = ?'
  );
  const insertStmt = db.prepare(`
    INSERT INTO debtors
      (account_number, debtor_name, phone_number, balance, status, client_name,
       entry_date, inbound, outbound, created_at, updated_at)
    VALUES
      (@account_number, @debtor_name, @phone_number, @balance, @status, @client_name,
       @entry_date, @inbound, @outbound, @created_at, @updated_at)
  `);
  const archiveStmt = db.prepare(`
    INSERT INTO archived_debtors
      (account_number, debtor_name, phone_number, balance, status, client_name,
       entry_date, inbound, outbound, created_at, updated_at, archived_at)
    VALUES
      (@account_number, @debtor_name, @phone_number, @balance, @status, @client_name,
       @entry_date, @inbound, @outbound, @created_at, @updated_at, @archived_at)
  `);
  const updateStmt = db.prepare(`
    UPDATE debtors
    SET debtor_name = @debtor_name, phone_number = @phone_number, balance = @balance,
        status = @status, client_name = @client_name, entry_date = @entry_date,
        inbound = @inbound, outbound = @outbound, updated_at = @updated_at
    WHERE account_number = @account_number
  `);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // row 1 is the header

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

    const existing = selectStmt.get(parsed.account_number);

    if (!existing) {
      insertStmt.run({ ...parsed, created_at: now, updated_at: now });
      stats.inserted++;
    } else if (hasChanged(existing, parsed)) {
      archiveStmt.run({ ...existing, archived_at: now });
      updateStmt.run({ ...parsed, updated_at: now });
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 && args[fileIdx + 1]
    ? args[fileIdx + 1]
    : path.join(process.cwd(), 'atlas_inventory.csv');

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const dbModule = require('../db/database');
  const initSchema = require('../db/schema');

  const db = dbModule.open();
  initSchema(db);

  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true });

  const stats = runIngestion(db, rows);
  console.log(`Ingestion complete: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errored} errored`);

  dbModule.close();
}

if (require.main === module) {
  main();
}

module.exports = { runIngestion, hasChanged };
```

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: PASS — all tests in database.test.js, schema.test.js, validate.test.js, and ingest.test.js pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest.js tests/ingest.test.js
git commit -m "feat: add ingestion script with upsert, archiving, and validation"
```

---

### Task 6: Sample CSV, README, and End-to-End Verification

**Files:**
- Create: `atlas_inventory.csv`
- Create: `README.md`

- [ ] **Step 1: Create atlas_inventory.csv**

```csv
account_number,debtor_name,phone_number,balance,status,client_name,entry_date,inbound,outbound
ACC001,John Doe,555-1234,1500.00,active,Atlas Recovery,2024-01-15,1,0
ACC002,Jane Smith,555-5678,2300.50,pending,Atlas Recovery,2024-01-20,0,1
ACC003,Bob Johnson,,500.00,closed,Atlas Recovery,2024-02-01,0,0
ACC004,Alice Brown,555-9999,-100.00,active,Atlas Recovery,,1,1
```

- [ ] **Step 2: Create README.md**

```markdown
# CollectWise Take Home — Atlas Recovery CSV Ingestion

Node.js script that ingests a CSV file of debtor accounts into a SQLite database, with validation, change-detection upserts, and historical archiving.

## Setup

```bash
npm install
```

## Usage

```bash
# Ingest default file (atlas_inventory.csv in project root)
npm run ingest

# Ingest a specific file
npm run ingest -- --file path/to/file.csv
```

## Database

SQLite database stored at `collectwise.db` (gitignored).

### Tables

- **`debtors`** — current state of all accounts. One row per `account_number`.
- **`archived_debtors`** — historical snapshots. When a live record is updated with changed data, the old version is copied here with an `archived_at` timestamp.

### Duplicate Handling

When a re-uploaded CSV contains an existing `account_number`:

- **Data identical** → skipped, no write.
- **Data changed** → old version archived, current record updated.
- **New account** → inserted.

If the same `account_number` appears more than once in a single CSV, the last occurrence wins. A warning is logged for each earlier duplicate.

## Validation

| Column | Required | Rule |
|---|---|---|
| `account_number` | Yes | Non-empty — row skipped on failure |
| `debtor_name` | Yes | Non-empty — row skipped on failure |
| `balance` | Yes | Numeric — row skipped if not numeric; warning if negative |
| `status` | Yes | Non-empty — row skipped on failure |
| `client_name` | Yes | Non-empty — row skipped on failure |
| `phone_number` | No | Stored as NULL if missing |
| `entry_date` | No | YYYY-MM-DD if present; NULL with warning if invalid format |
| `inbound` | No | 0 or 1; defaults to 0 if missing or invalid |
| `outbound` | No | 0 or 1; defaults to 0 if missing or invalid |

## Tests

```bash
npm test
```
```

- [ ] **Step 3: Run end-to-end — first ingest**

```bash
npm run ingest
```

Expected output (ACC004 has a negative balance warning):
```
Row 5 [ACC004]: negative balance -100
Ingestion complete: 4 inserted, 0 updated, 0 skipped, 0 errored
```

- [ ] **Step 4: Run again — confirm all skipped**

```bash
npm run ingest
```

Expected:
```
Ingestion complete: 0 inserted, 0 updated, 4 skipped, 0 errored
```

- [ ] **Step 5: Test update + archive**

Edit `atlas_inventory.csv` line 2: change `1500.00` → `1600.00`, then run:

```bash
npm run ingest
```

Expected:
```
Ingestion complete: 0 inserted, 1 updated, 3 skipped, 0 errored
```

Verify the archive:
```bash
node -e "const db = require('./db/database'); const conn = db.open(); console.log(conn.prepare('SELECT account_number, balance, archived_at FROM archived_debtors').all()); db.close();"
```

Expected: one row — `{ account_number: 'ACC001', balance: 1500, archived_at: '<timestamp>' }`

- [ ] **Step 6: Restore atlas_inventory.csv**

Edit line 2 back: `1600.00` → `1500.00`

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add atlas_inventory.csv README.md
git commit -m "feat: add sample CSV and README with usage docs"
```
