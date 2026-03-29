const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const dbModule = require('../db/database');
const initSchema = require('../db/schema');
const { runIngestion } = require('./ingest');
const { createApp } = require('../server');

const PORT = process.env.PORT || 3000;

const db = dbModule.open();
initSchema(db);

const csvPath = path.join(process.cwd(), 'atlas_inventory.csv');
if (fs.existsSync(csvPath)) {
  try {
    const content = fs.readFileSync(csvPath, 'utf8');
    const rows = parse(content, { columns: true, skip_empty_lines: true });
    const stats = runIngestion(db, rows);
    console.log(`DB seeded: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errored} errored`);
  } catch (err) {
    console.error(`Failed to seed DB from CSV: ${err.message}`);
    console.warn('Starting with existing DB state');
  }
} else {
  console.warn(`Warning: atlas_inventory.csv not found at ${csvPath}, starting with existing DB`);
}

const app = createApp(db);
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    dbModule.close();
    process.exit(0);
  });
});
