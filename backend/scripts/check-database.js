const { createDatabase } = require('../src/database/client');
async function main() {
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    const { rows } = await db.query('SELECT (SELECT count(*) FROM users) AS accounts,(SELECT count(*) FROM students) AS students,(SELECT count(*) FROM entry_logs) AS attendance_records,(SELECT count(*) FROM sync_outbox WHERE synced_at IS NULL) AS pending_sync_changes');
    console.log('[DATABASE] Connected to local PostgreSQL.');
    console.log(JSON.stringify(rows[0],null,2));
  } finally { await db.close(); }
}
main().catch(() => { console.error('[DATABASE] Unavailable. Start PostgreSQL and check DATABASE_URL.'); process.exitCode=1; });
