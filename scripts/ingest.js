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
      let client;
      try {
        client = await pool.connect();
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
        if (client) await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        if (client) client.release();
      }
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 && args[fileIdx + 1]
    ? args[fileIdx + 1]
    : path.join(process.cwd(), 'atlas_inventory.csv');

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const { createPool } = require('../db/database');
  const initSchema = require('../db/schema');

  const pool = createPool();
  await initSchema(pool);

  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true });

  const stats = await runIngestion(pool, rows);
  console.log(`Ingestion complete: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errored} errored`);

  await pool.end();
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runIngestion, hasChanged };
