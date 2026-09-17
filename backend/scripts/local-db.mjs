import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createConnection } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = path.join(root, '.local');
mkdirSync(local, { recursive: true });
const secretPath = path.join(local, 'database-secrets.json');
if (!existsSync(secretPath)) writeFileSync(secretPath, JSON.stringify({ admin: randomBytes(32).toString('hex'), app: randomBytes(32).toString('hex') }), { mode: 0o600, flag: 'wx' });
const secrets = JSON.parse(readFileSync(secretPath, 'utf8'));
const dataDir = path.join(local, 'postgres-data');
const port = 55432;
let startupOutput = '';
let started = false;
function captureStartupOutput(message) {
  if (!started) startupOutput = (startupOutput + String(message) + '\n').slice(-8000);
}
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: secrets.admin, port, persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'], onLog: captureStartupOutput, onError: captureStartupOutput });
try {
  const portInUse = await new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (inUse) => { socket.destroy(); resolve(inUse); };
    socket.setTimeout(1500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
  if (portInUse) {
    captureStartupOutput(`Port ${port} is already accepting connections.`);
    throw Object.assign(new Error('Database port is occupied'), { code: 'PORT_IN_USE' });
  }
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  started = true;
  startupOutput = '';
  const admin = new Client({ host: '127.0.0.1', port, user: 'postgres', password: secrets.admin, database: 'postgres' });
  await admin.connect();
  try {
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='gate_app'")).rowCount) {
      const sql = await admin.query("SELECT format('CREATE ROLE gate_app LOGIN PASSWORD %L', $1::text) AS sql", [secrets.app]);
      await admin.query(sql.rows[0].sql);
    }
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='gate_system'")).rowCount) await admin.query('CREATE DATABASE gate_system OWNER gate_app');
  } finally { await admin.end(); }
  const envPath = path.join(root, 'backend/.env');
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (!parseEnv(existing).DATABASE_URL) {
    const content = existing.replace(/^DATABASE_URL=.*$/gm, '').trimEnd();
    writeFileSync(envPath, content + `\nDATABASE_URL=postgresql://gate_app:${secrets.app}@127.0.0.1:${port}/gate_system\n`, { mode: 0o600 });
  }
  console.log(`[DATABASE] PostgreSQL running on 127.0.0.1:${port}. Data is persistent in .local/postgres-data.`);
  console.log('[DATABASE] Credentials saved privately. Run npm run db:migrate and npm run db:seed in another terminal.');
  const keepAlive = setInterval(() => {}, 60000);
  let stopping = false;
  async function stop() { if (stopping) return; stopping = true; clearInterval(keepAlive); await pg.stop(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) {
  // The startup library can reject without an Error when PostgreSQL exits early.
  const reason = error?.code || error?.name || 'POSTGRES_START_FAILED';
  let details = startupOutput.trim();
  for (const secret of [secrets.admin, secrets.app]) {
    if (secret) details = details.replaceAll(secret, '[REDACTED]');
  }
  console.error(`[DATABASE] Could not start local PostgreSQL (${reason}).`);
  if (details) console.error(details);
  console.error('[DATABASE] Run npm run db:check. If it connects, the database is already available; do not start a second instance.');
  console.error('[DATABASE] If the check fails, share this error with passwords hidden. Do not delete the data folder or lock files.');
  process.exitCode = 1;
}
