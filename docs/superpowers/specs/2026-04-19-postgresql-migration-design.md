# PostgreSQL Migration Design

**Date:** 2026-04-19  
**Goal:** Replace SQLite with Railway PostgreSQL so data persists across deploys and can be updated by uploading a CSV to a `POST /ingest` endpoint — no git push required.

---

## Architecture

```
CSV file (local)
  → POST /ingest (multipart upload)
    → validate rows
    → upsert into Railway PostgreSQL
      → GET /accounts/:id reads from PostgreSQL
```

Railway PostgreSQL is provisioned as a service in the same Railway project. Railway automatically injects `DATABASE_URL` into the app's environment. The app connects via a `pg.Pool`.

---

## Dependencies

**Add:**
- `pg` — PostgreSQL client
- `multer` — multipart file upload parsing

**Remove:**
- `better-sqlite3`

---

## File-by-file changes

### `db/database.js`
Replace the better-sqlite3 singleton with a `pg.Pool`.

- `createPool()` — reads `DATABASE_URL` from env, returns a `new Pool({ connectionString })`. Throws if `DATABASE_URL` is not set.
- `close()` — calls `pool.end()` for graceful shutdown.
- Remove `open(dbPath)` and `get()`.

### `db/schema.js`
Rewrite DDL for PostgreSQL. `initSchema(pool)` becomes async.

Key type changes from SQLite:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `REAL` → `NUMERIC(12,2)`
- `INTEGER` (for inbound/outbound) → `SMALLINT`
- `TEXT` (for timestamps) → `TIMESTAMPTZ`
- `?` placeholders → `$1, $2, ...`

Tables and indexes stay the same (`debtors`, `archived_debtors`, both with indexes on `account_number` and `phone_number`).

### `scripts/ingest.js`
`runIngestion(pool, rows)` becomes async. All DB calls use `await pool.query(sql, [...params])`. Rows come back as `result.rows[0]`.

Transaction pattern replaces `db.transaction()`:
```js
const client = await pool.connect();
await client.query('BEGIN');
// archive + update
await client.query('COMMIT');
client.release();
// on error: await client.query('ROLLBACK'); client.release();
```

`hasChanged()` is pure and unchanged.

### `server.js`
- `createApp(pool)` — same signature.
- `GET /accounts/:id` — becomes async, uses `pool.query()`, reads `result.rows[0]`.
- **New: `POST /ingest`** — see below.
- Remove prepared statement caching (pg uses the pool's built-in prepared statement cache).

### `POST /ingest` endpoint
- Route: `POST /ingest`
- Parser: `multer({ storage: multer.memoryStorage() })`, field name `file`
- Parses CSV from `req.file.buffer.toString('utf8')` using `csv-parse/sync`
- Calls `await runIngestion(pool, rows)`
- Returns `200` with `{ inserted, updated, skipped, errored }`
- Returns `400` if no file is provided
- Returns `500` on unexpected error (with `{ error: message }`)

**Usage:**
```bash
curl -F "file=@atlas_inventory.csv" https://your-app.railway.app/ingest
```

### `scripts/start.js`
Simplified — remove the CSV seeding block entirely. Data lives in PostgreSQL and is not rebuilt on startup.

```js
const pool = db.createPool();
await initSchema(pool);
const app = createApp(pool);
app.listen(PORT, ...);
```

---

## Tests

Current tests use `db.open(':memory:')` for isolation. PostgreSQL has no `:memory:` mode, so tests switch to `pg-mem` — an in-memory PostgreSQL implementation with the same wire protocol.

- **`database.test.js`** — replace SQLite connection tests with pool creation test; verify `DATABASE_URL` missing throws.
- **`schema.test.js`** — use `pg-mem`, replace `PRAGMA table_info` with `information_schema.columns` query; uniqueness and idempotency tests stay.
- **`ingest.test.js`** — use `pg-mem`, make all tests async (`await runIngestion(...)`); raw SQL assertions use `pool.query()`.
- **`server.test.js`** — use `pg-mem`, add `POST /ingest` tests (valid CSV, missing file, invalid rows).
- **`validate.test.js`** — no changes (pure functions).

`pg-mem` is a dev dependency only. Tests set `DATABASE_URL` to a fake value; `pg-mem` intercepts the connection.

---

## Railway setup (manual, one-time)

1. In Railway dashboard: Add a PostgreSQL service to the project.
2. In the app service: add a reference variable `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
3. Deploy — Railway injects the URL and the app connects on startup.

No `collectwise.db` file is committed or used in production after this change.

---

## Error handling

- Missing `DATABASE_URL` on startup → throw immediately (fail fast).
- DB connection failure → let it propagate; Railway restarts the service.
- `POST /ingest` with no file → `400 { error: 'No file uploaded' }`.
- `POST /ingest` with invalid CSV → `200` with errored count (row-level errors are not fatal).
- Unexpected DB error during ingest → `500 { error: message }`.
