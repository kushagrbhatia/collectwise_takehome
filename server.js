const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { runIngestion } = require('./scripts/ingest');

const upload = multer({ storage: multer.memoryStorage() });

function createApp(pool) {
  const app = express();

  app.get('/accounts/:accountNumber', async (req, res) => {
    const result = await pool.query(
      `SELECT account_number, debtor_name, phone_number, balance, status, client_name
       FROM debtors WHERE account_number = $1`,
      [req.params.accountNumber]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({
        error: 'Account not found',
        account_number: req.params.accountNumber,
      });
    }
    res.json(row);
  });

  app.post('/ingest', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
      const content = req.file.buffer.toString('utf8');
      const rows = parse(content, { columns: true, skip_empty_lines: true });
      const stats = await runIngestion(pool, rows);
      res.json(stats);
    } catch (err) {
      if (err.code && err.code.startsWith('CSV_')) {
        return res.status(400).json({ error: `Invalid CSV: ${err.message}` });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
