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
