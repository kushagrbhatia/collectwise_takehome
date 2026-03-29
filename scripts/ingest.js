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
    // Compare as strings to handle numeric/text edge cases
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
  const archiveAndUpdate = db.transaction((existing, parsed, now) => {
    archiveStmt.run({ ...existing, archived_at: now });
    updateStmt.run({ ...parsed, updated_at: now });
  });

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
      archiveAndUpdate(existing, parsed, now);
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
