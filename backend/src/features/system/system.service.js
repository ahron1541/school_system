const { Client } = require('pg');

function probeDatabase(databaseUrl) {
  if (!databaseUrl) return Promise.resolve({ state: 'not_configured', latencyMs: null });
  let address;
  try {
    address = new URL(databaseUrl);
    if (!['postgresql:','postgres:'].includes(address.protocol) || !address.hostname || address.pathname.length < 2) throw new Error();
  } catch {
    return Promise.resolve({ state: 'invalid_configuration', latencyMs: null });
  }
  return new Promise((resolve) => {
    const started = Date.now();
    let connection;
    let complete = false;
    const finish = (state) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      connection?.end().catch(() => {});
      resolve({ state, latencyMs: state === 'connected' ? Date.now() - started : null });
    };
    // Bound the entire handshake and query, including servers that accept TCP but never reply.
    const timer = setTimeout(() => finish('disconnected'), 2500);
    try {
      connection = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1500, query_timeout: 1500 });
      connection.on('error', () => finish('disconnected'));
      connection.connect().then(() => connection.query('SELECT 1')).then(() => finish('connected')).catch(() => finish('disconnected'));
    } catch {
      finish('disconnected');
    }
  });
}

function createSystemService(config, devices, probe = probeDatabase, db) {
  let pending;
  let cached;
  let checkedAt = 0;
  async function status() {
    if (!cached || Date.now() - checkedAt >= 5000) {
      if (!pending) {
        pending = probe(config.databaseUrl).then((database) => {
          checkedAt = Date.now();
          cached = { ...database, checkedAt: new Date(checkedAt).toISOString() };
        }).finally(() => { pending = null; });
      }
      await pending;
    }
    const device = devices.status();
    const pendingSync = db ? Number((await db.query('SELECT count(*) FROM sync_outbox WHERE synced_at IS NULL')).rows[0].count) : 0;
    return {
      checkedAt: new Date().toISOString(),
      api: { state: 'connected' }, database: cached,
      device: { deviceId: device.deviceId, state: device.connection, lastSeenAt: device.lastSeenAt },
      storage: 'postgresql', sync: { state: 'not_configured', pending: pendingSync },
    };
  }
  return { status };
}

module.exports = { probeDatabase, createSystemService };
