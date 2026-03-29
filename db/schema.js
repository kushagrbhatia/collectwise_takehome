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
    CREATE INDEX IF NOT EXISTS idx_archived_debtors_phone_number ON archived_debtors(phone_number);
  `);
}

module.exports = initSchema;
