# Account Lookup API — Design Spec

**Date:** 2026-03-29
**Project:** CollectWise Take Home — Atlas Recovery Account Lookup API

---

## Context

The AI agent currently looks up accounts by phone number. This API adds lookup by `account_number` so the agent can retrieve a debtor's full record from the SQLite database seeded by the CSV ingestion script.

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Database:** SQLite via `better-sqlite3` (existing `db/database.js` singleton)
- **Testing:** Jest + supertest
- **Deployment:** Railway (GitHub integration, no cold starts)

---

## Endpoint

```
GET /accounts/:accountNumber
```

### 200 — Found

```json
{
  "account_number": "ACC001",
  "debtor_name": "John Doe",
  "phone_number": "555-1234",
  "balance": 1500.00,
  "status": "active",
  "client_name": "Atlas Recovery"
}
```

### 404 — Not Found

```json
{
  "error": "Account not found",
  "account_number": "ACC999"
}
```

No other fields are returned. `phone_number` may be `null` if absent in the database.

---

## Architecture

### Files

```
/
├── server.js               # Express app — exports app, does NOT call app.listen()
├── scripts/
│   └── start.js            # Entry point: opens DB, runs ingest, then starts server
├── tests/
│   └── server.test.js      # HTTP-level tests via supertest
└── package.json            # add "start": "node scripts/start.js"
```

**`server.js`** — Creates the Express app and registers the one route. Accepts the `db` connection as a parameter to `createApp(db)` so tests can inject an in-memory database. Does not call `app.listen()`.

**`scripts/start.js`** — Production entry point. Opens the real `collectwise.db`, runs `initSchema` and `runIngestion` to seed it from `atlas_inventory.csv`, then calls `app.listen(PORT)`. `PORT` defaults to `3000`, overridden by `process.env.PORT` (Railway sets this automatically).

**`tests/server.test.js`** — Uses supertest against `createApp(db)` with an in-memory SQLite database pre-seeded with known rows. Tests: account found (200), account not found (404).

### Request Flow

```
GET /accounts/:accountNumber
  → Express route handler
  → db.prepare('SELECT ... FROM debtors WHERE account_number = ?').get(accountNumber)
  → row found     → 200 JSON (6 fields)
  → row not found → 404 JSON { error, account_number }
```

---

## Database

Re-uses the existing `db/database.js` and `db/schema.js`. No schema changes. The query selects only the 6 required fields:

```sql
SELECT account_number, debtor_name, phone_number, balance, status, client_name
FROM debtors
WHERE account_number = ?
```

---

## Deployment — Railway

### One-time setup

1. Push repo to GitHub.
2. Create a new Railway project → "Deploy from GitHub repo".
3. Railway auto-detects Node.js and runs `npm start`.
4. Railway provides a public URL: `https://<app-name>.railway.app`.

### How seeding works on deploy

`npm start` → `scripts/start.js` → directly calls `initSchema` + `runIngestion` with `atlas_inventory.csv` → starts Express server. No subprocess spawning.

SQLite database file lives on the Railway container's local filesystem. On each deploy, the CSV is re-ingested (unchanged rows are skipped, changed rows are archived and updated). The DB is ephemeral across deploys — acceptable for a demo since the source of truth is the committed CSV.

### Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Set automatically by Railway |

No other environment variables required.

---

## Running Locally

```bash
npm start          # seeds DB from atlas_inventory.csv, then starts server on :3000
npm test           # runs all tests (32 existing + 2 new)
```

```bash
curl http://localhost:3000/accounts/ACC001
```

---

## Testing

Two new tests in `tests/server.test.js`:

| Test | Expected |
|---|---|
| GET /accounts/ACC001 (exists) | 200, correct JSON fields |
| GET /accounts/NOTEXIST (missing) | 404, `{ error, account_number }` |

All 32 existing tests continue to pass. Total: 34.
