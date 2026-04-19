require('dotenv').config();

const db = require('../db/database');
const initSchema = require('../db/schema');
const { createApp } = require('../server');

const PORT = process.env.PORT || 3000;

async function main() {
  const pool = db.createPool();
  await initSchema(pool);
  const app = createApp(pool);
  const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
  process.on('SIGTERM', () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

main().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
