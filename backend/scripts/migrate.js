const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { createDatabase } = require('../src/database/client');

async function migrate() {
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(7914001)');
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const folder = path.join(__dirname, '../src/database/migrations');
      for (const name of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) {
        const found = await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name]);
        if (!found.rowCount) {
          await client.query(await readFile(path.join(folder, name), 'utf8'));
          await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
          console.log(`[DATABASE] Applied ${name}`);
        }
      }
    });
  } finally { await db.close(); }
}
migrate().catch(() => { console.error('[DATABASE] Migration failed. Check the local database and configuration.'); process.exitCode = 1; });
