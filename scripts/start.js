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
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true });
  const stats = runIngestion(db, rows);
  console.log(`DB seeded: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errored} errored`);
} else {
  console.warn(`Warning: atlas_inventory.csv not found at ${csvPath}, starting with existing DB`);
}

const app = createApp(db);
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
