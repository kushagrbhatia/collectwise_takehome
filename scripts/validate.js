function validateRow(row, rowNum) {
  const errors = [];
  const warnings = [];
  const acct = row.account_number && row.account_number.trim();

  function loc() {
    return acct ? `Row ${rowNum} [${acct}]` : `Row ${rowNum}`;
  }

  // Required string fields
  if (!row.account_number || !row.account_number.trim()) {
    errors.push(`Row ${rowNum}: missing or empty account_number`);
  }
  if (!row.debtor_name || !row.debtor_name.trim()) {
    errors.push(`${loc()}: missing or empty debtor_name`);
  }
  if (!row.status || !row.status.trim()) {
    errors.push(`${loc()}: missing or empty status`);
  }
  if (!row.client_name || !row.client_name.trim()) {
    errors.push(`${loc()}: missing or empty client_name`);
  }

  // Balance — required numeric
  const balance = parseFloat(row.balance);
  if (row.balance === undefined || row.balance === '' || isNaN(balance)) {
    errors.push(`${loc()}: balance is not numeric: "${row.balance}"`);
  } else if (balance < 0) {
    warnings.push(`${loc()}: negative balance ${balance}`);
  }

  // phone_number — optional, null if missing or empty
  const phone_number = (row.phone_number && row.phone_number.trim()) || null;

  // entry_date — optional, null if missing or invalid YYYY-MM-DD format
  let entry_date = null;
  if (row.entry_date && row.entry_date.trim()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date.trim())) {
      entry_date = row.entry_date.trim();
    } else {
      warnings.push(`${loc()}: invalid entry_date format "${row.entry_date}", storing NULL`);
    }
  }

  // inbound / outbound — default 0 if missing or not exactly 0/1
  const inbound = (row.inbound === '1' || row.inbound === 1) ? 1 : 0;
  const outbound = (row.outbound === '1' || row.outbound === 1) ? 1 : 0;

  // Mutual exclusivity — a call cannot be both inbound and outbound
  if (inbound === 1 && outbound === 1) {
    errors.push(`${loc()}: inbound and outbound cannot both be 1`);
  }

  const parsed = {
    account_number: acct || null,
    debtor_name: row.debtor_name ? row.debtor_name.trim() : null,
    phone_number,
    balance: isNaN(balance) ? null : balance,
    status: row.status ? row.status.trim() : null,
    client_name: row.client_name ? row.client_name.trim() : null,
    entry_date,
    inbound,
    outbound,
  };

  return { errors, warnings, parsed };
}

module.exports = { validateRow };
