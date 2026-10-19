const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createApplication } = require('../dist/backend/src/app.js');
const { readConfig } = require('../dist/backend/src/config.js');
async function start() {
  const db = new PGlite();
  await db.exec(readFileSync(join(__dirname, '../src/schema.sql'), 'utf8'));
  const storage = { query: (sql, values) => db.query(sql, values), transaction: fn => db.transaction(tx => fn({ query: (sql, values) => tx.query(sql, values) })), close: () => db.close() };
  const app = await createApplication(storage, readConfig({ NODE_ENV: 'test', DATABASE_URL: 'test-only', PUBLIC_ORIGIN: 'http://127.0.0.1:5174', ADMIN_USERNAME: 'creator', ADMIN_PASSWORD: process.env.STUDIO_E2E_PASSWORD }));
  await app.listen(3031, '127.0.0.1');
  process.on('SIGTERM', async () => { await app.close(); await db.close(); process.exit(0); });
}
start().catch(() => { process.stderr.write('Test API startup failed\n'); process.exitCode = 1; });
