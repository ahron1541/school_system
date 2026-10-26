const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtemp, writeFile, mkdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('./app');
const { readEnv } = require('../shared/config/env');

test('LAN build is opt-in and validates its setting', () => {
  const env = { DEVICE_API_KEY: 'a'.repeat(64) };
  assert.equal(readEnv(env).serveFrontend, false);
  assert.equal(readEnv({ ...env, SERVE_FRONTEND: 'true' }).serveFrontend, true);
  assert.throws(() => readEnv({ ...env, SERVE_FRONTEND: 'yes' }), /SERVE_FRONTEND/);
});

test('built LAN site serves local assets without weakening API or origin protection', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gate-lan-'));
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const config = { deviceKey: 'a'.repeat(64), serveFrontend: true, appOrigins: ['http://192.168.100.5:4000'] };
  const db = { query: async () => { throw new Error('Unexpected database access'); } };
  assert.throws(() => createApp(config, { db, frontendDirectory: directory }), /Frontend build is missing/);
  await mkdir(path.join(directory, 'assets'));
  await mkdir(path.join(directory, 'api'));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Local Gatehouse</title>');
  await writeFile(path.join(directory, 'assets', 'app.js'), 'console.log("local");');
  await writeFile(path.join(directory, 'assets', 'app-a1b2c3d4.js'), 'console.log("versioned");');
  await writeFile(path.join(directory, 'api', 'fake'), 'must not serve this');
  await writeFile(path.join(directory, '.env'), 'must not serve this');
  server = createApp(config, { db, frontendDirectory: directory }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const home = await fetch(base + '/?display=1');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Local Gatehouse/);
  assert.doesNotMatch(home.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  assert.match(home.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(base + '/assets/app.js')).status, 200);
  assert.equal((await fetch(base+'/assets/app-a1b2c3d4.js')).headers.get('cache-control'),'public, max-age=31536000, immutable');
  assert.equal((await fetch(base+'/api/health')).headers.get('cache-control'),'no-store');
  for (const route of ['/api/fake', '/api/missing', '/assets/missing.js', '/.env', '/package.json']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    assert.equal((await response.json()).success, false);
  }
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal((await fetch(base + '/api/students')).status, 401);
  for (const [origin, status] of [['http://192.168.100.5:4000', 422], ['http://untrusted.invalid', 403]]) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, status);
  }
});
