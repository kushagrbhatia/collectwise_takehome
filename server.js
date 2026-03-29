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
