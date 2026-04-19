async function initSchema(pool) {
  try {
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
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('Not supported')) {
      throw err;
    }
  }

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_debtors_account_number ON debtors(account_number)
    `);
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('Not supported')) {
      throw err;
    }
  }

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_debtors_phone_number ON debtors(phone_number)
    `);
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('Not supported')) {
      throw err;
    }
  }

  try {
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
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('Not supported')) {
      throw err;
    }
  }

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_archived_debtors_account_number ON archived_debtors(account_number)
    `);
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('Not supported')) {
      throw err;
    }
  }

  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_archived_debtors_phone_number ON archived_debtors(phone_number)
    `);
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('Not supported')) {
      throw err;
    }
  }
}

module.exports = initSchema;
