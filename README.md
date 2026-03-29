# CollectWise Take Home — Atlas Recovery Account Lookup

Node.js service that ingests a CSV file of debtor accounts into a SQLite database and exposes an HTTP API for account lookup, with validation, change-detection upserts, and historical archiving.

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

## API

### Run locally

```bash
npm start
```

Seeds the database from `atlas_inventory.csv` then starts the server on port 3000.

### Endpoint

```
GET /accounts/:accountNumber
```

**200 — account found:**

```json
{
  "account_number": "ACC001",
  "debtor_name": "John Doe",
  "phone_number": "555-1234",
  "balance": 1500,
  "status": "active",
  "client_name": "Atlas Recovery"
}
```

**404 — account not found:**

```json
{
  "error": "Account not found",
  "account_number": "ACC999"
}
```

**Example:**

```bash
# Local
curl http://localhost:3000/accounts/ACC001

# Deployed
curl https://collectwisetakehome-production.up.railway.app/accounts/ACC001
```

## Tests

```bash
npm test
```

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
curl https://collectwisetakehome-production.up.railway.app/accounts/ACC001
curl https://collectwisetakehome-production.up.railway.app/accounts/NOTEXIST
```
