const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../../app/app');
const { readEnv } = require('../../shared/config/env');

test('device API: validation, retries, status and recovery', async (t) => {
  let time = 100000;
  const config = { deviceId: 'gate-01', deviceKey: randomBytes(32).toString('hex') };
  const server = createApp(config, { now: () => time, log: () => {} }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const scan = { uid: 'a1b2c3d4', deviceId: 'gate-01', eventId: 'boot1-1' };
  async function request(path, method = 'GET', body, key = config.deviceKey, type = 'application/json') {
    const response = await fetch(base + path, { method,
      headers: { 'Content-Type': type, 'X-Device-Key': key },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await request('/health')).body.success, true);
  assert.equal((await request('/devices/gate-01/status')).body.data.connection, 'never_seen');
  assert.equal((await request('/devices/gate-01/status', 'GET', undefined, '')).status, 401);
  assert.equal((await request('/devices/test-scans', 'POST', scan, 'wrong')).status, 401);
  for (const body of [{}, null, [], { ...scan, uid: 'XYZ' }, { ...scan, uid: 1234 }, { ...scan, extra: true }]) {
    assert.ok([400, 422].includes((await request('/devices/test-scans', 'POST', body)).status));
  }
  assert.equal((await request('/devices/test-scans', 'POST', '{')).body.error.code, 'INVALID_JSON');
  const nonJson = await request('/devices/test-scans', 'POST', scan, config.deviceKey, 'text/plain');
  assert.equal(nonJson.status, 415);
  assert.equal(nonJson.body.error.code, 'JSON_REQUIRED');
  assert.equal((await request('/devices/test-scans', 'POST', { ...scan, uid: 'A'.repeat(3000) })).status, 413);
  assert.equal((await request('/devices/test-scans', 'POST', { ...scan, deviceId: 'other' })).status, 403);
  const first = await request('/devices/test-scans', 'POST', scan);
  assert.equal(first.status, 201);
  assert.equal(first.body.data.uid, 'A1B2C3D4');
  const retry = await request('/devices/test-scans', 'POST', scan);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.duplicate, true);
  assert.equal(retry.body.data.receivedAt, first.body.data.receivedAt);
  assert.equal((await request('/devices/test-scans', 'POST', { ...scan, uid: '11223344' })).status, 409);
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => request('/devices/test-scans', 'POST', { ...scan, eventId: 'parallel' })));
  assert.equal(concurrent.filter((result) => result.status === 201).length, 1);
  assert.equal((await request('/devices/gate-01/status')).body.data.connection, 'online');
  time += 15000;
  assert.equal((await request('/devices/gate-01/status')).body.data.connection, 'offline');
  assert.equal((await request('/devices/gate-01/heartbeat', 'PUT')).body.data.connection, 'online');
  assert.equal((await request('/devices/other/heartbeat', 'PUT')).status, 403);
  assert.equal((await request('/devices/other/status')).status, 404);
  assert.equal((await request('/missing')).body.error.code, 'ROUTE_NOT_FOUND');
});

test('environment rejects invalid configuration', () => {
  const source = { DEVICE_API_KEY: randomBytes(32).toString('hex') };
  assert.equal(readEnv(source).port, 4000);
  assert.equal(readEnv(source).deviceRateLimit, 240);
  for (const value of ['0', '-1', '1.5', 'abc', '10001']) assert.throws(() => readEnv({ ...source, DEVICE_RATE_LIMIT_PER_MINUTE: value }));
  for (const change of [{ PORT: 'abc' }, { PORT: '0' }, { HOST: 'bad' }, { DEVICE_ID: '../x' }, { DEVICE_API_KEY: '' }, { DEVICE_API_KEY: 'replace_with_a_random_key_at_least_32_characters' }]) {
    assert.throws(() => readEnv({ ...source, ...change }));
  }
});

test('device HTTP boundary limits both endpoints before parsing or database access', async (t) => {
  const config = { deviceId: 'gate-01', deviceKey: randomBytes(32).toString('hex'), deviceRateLimit: 3 };
  const app = createApp(config, { log: () => {} });
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await app.locals.db.close(); });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, key = config.deviceKey) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Key': key }, body: '{' });
  assert.equal((await post('/entry-logs/scan', 'wrong')).status, 401, 'reject credentials before parsing malformed JSON');
  assert.equal((await post('/entry-logs/scan')).status, 400);
  assert.equal((await post('/devices/test-scans')).status, 400);
  const limited = await post('/entry-logs/scan');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await limited.json()).error.code, 'DEVICE_RATE_LIMIT');
  assert.equal((await fetch(base + '/devices/gate-01/status', { headers: { 'X-Device-Key': config.deviceKey } })).status, 429, 'shared budget includes device status');
  assert.equal((await fetch(base + '/health')).status, 200, 'staff/API health is not blocked by a device burst');
});
