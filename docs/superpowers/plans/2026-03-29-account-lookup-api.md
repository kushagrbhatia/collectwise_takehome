# Account Lookup API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a `GET /accounts/:accountNumber` Express endpoint backed by the existing SQLite `debtors` table, deployable to Railway.

**Architecture:** `server.js` exports `createApp(db)` (testable, no side effects). `scripts/start.js` is the production entry point — opens real DB, seeds from CSV, starts server. Tests use supertest with an in-memory DB.

**Tech Stack:** Node.js, Express, supertest, better-sqlite3 (existing), Railway deployment

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `express` dep, `supertest` devDep, `"start"` script |
| `server.js` | Create: `createApp(db)` factory, one route |
| `scripts/start.js` | Create: production entry point (seed + listen) |
| `tests/server.test.js` | Create: 2 supertest tests |
| `README.md` | Add Railway deployment section |

---

### Task 1: Install Dependencies and Add Start Script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install express and supertest**

```bash
npm install express
npm install --save-dev supertest
```

Expected: `node_modules/express/` and `node_modules/supertest/` created. No errors.

- [ ] **Step 2: Add start script to package.json**

Edit `package.json` so the `"scripts"` section reads:

```json
"scripts": {
  "ingest": "node scripts/ingest.js",
  "start": "node scripts/start.js",
  "test": "jest"
}
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
npm test
```

Expected: 32 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express and supertest dependencies"
```

---

### Task 2: Create server.js

**Files:**
- Create: `server.js`
- Create: `tests/server.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/server.test.js --no-coverage
```

Expected: FAIL — `Cannot find module './server'`

- [ ] **Step 3: Create server.js**

```javascript
const express = require('express');

function createApp(db) {
  const app = express();

  const selectStmt = db.prepare(
    `SELECT account_number, debtor_name, phone_number, balance, status, client_name
     FROM debtors WHERE account_number = ?`
  );

  app.get('/accounts/:accountNumber', (req, res) => {
    const row = selectStmt.get(req.params.accountNumber);
    if (!row) {
      return res.status(404).json({
        error: 'Account not found',
        account_number: req.params.accountNumber,
      });
    }
    res.json(row);
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: 34 passed, 0 failed (32 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server.js tests/server.test.js
git commit -m "feat: add account lookup API endpoint"
```

---

### Task 3: Create scripts/start.js (Production Entry Point)

**Files:**
- Create: `scripts/start.js`

- [ ] **Step 1: Create scripts/start.js**

```javascript
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const dbModule = require('../db/database');
const initSchema = require('../db/schema');
const { runIngestion } = require('./ingest');
const { createApp } = require('../server');

const PORT = process.env.PORT || 3000;

const db = dbModule.open();
initSchema(db);

const csvPath = path.join(process.cwd(), 'atlas_inventory.csv');
if (fs.existsSync(csvPath)) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true });
  const stats = runIngestion(db, rows);
  console.log(`DB seeded: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errored} errored`);
} else {
  console.warn(`Warning: atlas_inventory.csv not found at ${csvPath}, starting with existing DB`);
}

const app = createApp(db);
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

- [ ] **Step 2: Test start.js locally**

```bash
npm start
```

Expected output (similar to):
```
Row 5 [ACC004]: negative balance -100
Row 5 [ACC004]: inbound and outbound cannot both be 1
DB seeded: 0 inserted, 0 updated, 3 skipped, 2 errored
Server listening on port 3000
```

Then in a second terminal:
```bash
curl http://localhost:3000/accounts/ACC001
```

Expected:
```json
{"account_number":"ACC001","debtor_name":"John Doe","phone_number":"555-1234","balance":1500,"status":"active","client_name":"Atlas Recovery"}
```

```bash
curl http://localhost:3000/accounts/NOTEXIST
```

Expected:
```json
{"error":"Account not found","account_number":"NOTEXIST"}
```

Stop the server (`Ctrl+C`).

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: 34 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add scripts/start.js
git commit -m "feat: add start.js — seeds DB from CSV then starts Express server"
```

---

### Task 4: Add Railway Deployment Instructions to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add deployment section to README.md**

Append the following section to the end of `README.md`:

```markdown
## Deployment (Railway)

### Prerequisites

- A [Railway](https://railway.app) account
- The repo pushed to GitHub

### Steps

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select this repository
3. Railway auto-detects Node.js and runs `npm start`
4. Once deployed, Railway provides a public URL (e.g. `https://<app-name>.railway.app`)

### How it works

On each deploy, `npm start` seeds the database from `atlas_inventory.csv` then starts the server. The SQLite database lives on the container filesystem — no external database required.

### Environment variables

None required. Railway sets `PORT` automatically.

### Calling the API

```bash
curl https://<app-name>.railway.app/accounts/ACC001
```
```

- [ ] **Step 2: Verify README renders correctly**

Open `README.md` and confirm the new section is present and the markdown is valid (no broken code fences).

- [ ] **Step 3: Run all tests one final time**

```bash
npm test
```

Expected: 34 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add Railway deployment instructions to README"
```
