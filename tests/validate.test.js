const { validateRow } = require('../scripts/validate');

describe('validateRow', () => {
  function baseRow() {
    return {
      account_number: 'ACC001',
      debtor_name: 'John Doe',
      phone_number: '555-1234',
      balance: '100.00',
      status: 'active',
      client_name: 'Atlas Recovery',
      entry_date: '2024-01-15',
      inbound: '1',
      outbound: '0',
    };
  }

  test('valid row returns no errors or warnings', () => {
    const result = validateRow(baseRow(), 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.parsed.balance).toBe(100);
    expect(result.parsed.entry_date).toBe('2024-01-15');
    expect(result.parsed.inbound).toBe(1);
    expect(result.parsed.outbound).toBe(0);
  });

  test('missing account_number is a hard error', () => {
    const row = baseRow();
    row.account_number = '';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/account_number/);
  });

  test('whitespace-only debtor_name is a hard error', () => {
    const row = baseRow();
    row.debtor_name = '   ';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/debtor_name/);
  });

  test('non-numeric balance is a hard error', () => {
    const row = baseRow();
    row.balance = 'not-a-number';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/balance/);
  });

  test('missing status is a hard error', () => {
    const row = baseRow();
    row.status = '';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/status/);
  });

  test('missing client_name is a hard error', () => {
    const row = baseRow();
    row.client_name = '';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/client_name/);
  });

  test('negative balance produces warning but no error', () => {
    const row = baseRow();
    row.balance = '-50';
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/negative/i);
    expect(result.parsed.balance).toBe(-50);
  });

  test('missing phone_number stored as null', () => {
    const row = baseRow();
    delete row.phone_number;
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed.phone_number).toBeNull();
  });

  test('invalid entry_date format produces warning and stores null', () => {
    const row = baseRow();
    row.entry_date = '01/15/2024';
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/entry_date/);
    expect(result.parsed.entry_date).toBeNull();
  });

  test('missing entry_date stores null without warning', () => {
    const row = baseRow();
    delete row.entry_date;
    const result = validateRow(row, 2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.parsed.entry_date).toBeNull();
  });

  test('invalid inbound value defaults to 0', () => {
    const row = baseRow();
    row.inbound = 'yes';
    const result = validateRow(row, 2);
    expect(result.parsed.inbound).toBe(0);
  });

  test('missing outbound defaults to 0', () => {
    const row = baseRow();
    delete row.outbound;
    const result = validateRow(row, 2);
    expect(result.parsed.outbound).toBe(0);
  });

  test('both inbound and outbound set to 1 is a hard error', () => {
    const row = baseRow();
    row.inbound = '1';
    row.outbound = '1';
    const result = validateRow(row, 2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => /inbound/i.test(e) && /outbound/i.test(e))).toBe(true);
  });

  test('includes row number in error messages', () => {
    const row = baseRow();
    row.account_number = '';
    const result = validateRow(row, 5);
    expect(result.errors[0]).toMatch(/5/);
  });

  test('includes account_number in error messages when available', () => {
    const row = baseRow();
    row.balance = 'bad';
    const result = validateRow(row, 3);
    expect(result.errors[0]).toMatch(/ACC001/);
  });
});
