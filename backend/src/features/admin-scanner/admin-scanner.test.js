const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const { createApp } = require('../../app/app');
const { createDatabase } = require('../../database/client');
const { createAdminScannerService } = require('./admin-scanner.service');

test('capture expiry and cancellation reject delayed scans without assigning data', async () => {
  let time = 1000;
  const service = createAdminScannerService({ query: async () => ({ rows: [{ token_hash: 'owner' }] }) }, () => time);
  const first = await service.start('owner', null);
  assert.throws(() => service.read(first.id, 'other'), { code: 'CAPTURE_FORBIDDEN' });
  await assert.rejects(service.start('other', null), { code: 'SCANNER_BUSY' });
  time += 90001;
  await assert.rejects(service.receive(first.id, 'ABCDEF01'), { code: 'CAPTURE_EXPIRED' });
  const second = await service.start('owner', null);
  service.cancel(second.id, 'owner');
  await assert.rejects(service.receive(second.id, 'ABCDEF01'), { code: 'CAPTURE_EXPIRED' });
});

test('real API: authorized capture, conflicts, new/existing student assignment, cancellation and no attendance', async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Start local PostgreSQL first.');
  const admin = new Client({ connectionString: process.env.DATABASE_URL }); await admin.connect();
  const schema = 'test_scanner_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE SCHEMA ' + schema);
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('options', '-c search_path=' + schema);
  const db = createDatabase(url.toString());
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.close(); await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end();
  });
  const folder = path.join(__dirname, '../../database/migrations');
  for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) await db.query(await readFile(path.join(folder, file), 'utf8'));
  const config = { deviceKey: randomBytes(32).toString('hex'), adminScannerKey: randomBytes(32).toString('hex') };
  server = createApp(config, { db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  async function request(route, { method = 'GET', body, staff, key } = {}) {
    const response = await fetch(base + route, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(staff ? { Cookie: staff.cookie, 'X-CSRF-Token': staff.csrf || '' } : {}), ...(key ? { 'X-Device-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  }
  async function session(role) {
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    await db.query('INSERT INTO users(id,username,full_name,password_hash,role) VALUES($1,$2,$2,$3,$4)', [id, id, 'unused-test-hash', role]);
    const hash = createHash('sha256').update(token).digest('hex');
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [hash, id]);
    const staff = { cookie: 'gate_session=' + token, hash };
    staff.csrf = (await request('/auth/me', { staff })).data.csrfToken;
    return staff;
  }
  const staff = await session('ADMIN'), other = await session('REGISTRAR'), guard = await session('GUARD');
  const start = (body = {}, owner = staff) => request('/admin-scanner/captures', { method: 'POST', body, staff: owner });
  const scan = (id, uid = '0B1F3254') => request('/admin-scanner/device/scans', { method: 'POST', body: { captureId: id, uid }, key: config.adminScannerKey });
  const cancel = (id) => request('/admin-scanner/captures/' + id, { method: 'DELETE', staff });
  assert.equal((await request('/admin-scanner/captures', { method: 'POST', body: {} })).status, 401);
  assert.equal((await start({}, guard)).status, 403);
  assert.equal((await start({ invalid: true })).status, 422);
  assert.equal((await request('/admin-scanner/device/capture', { key: config.deviceKey })).status, 401);
  let capture = await start(); assert.equal(capture.status, 201);
  assert.equal((await start({}, other)).status, 409);
  assert.equal((await request('/admin-scanner/captures/' + capture.data.id, { staff: other })).status, 403);
  assert.equal((await request('/admin-scanner/device/capture', { key: config.adminScannerKey })).data.id, capture.data.id);
  assert.equal((await scan(capture.data.id, 'BAD')).status, 422);
  const concurrent = await Promise.all([scan(capture.data.id), scan(capture.data.id)]);
  assert.ok(concurrent.some((r) => r.status === 200));
  assert.ok(concurrent.every((r) => [200,409].includes(r.status)));
  assert.equal((await scan(capture.data.id)).data.state, 'captured');
  assert.equal((await scan(capture.data.id, 'ABCDEF01')).status, 409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM students')).rows[0].n, 0);
  await cancel(capture.data.id);
  const body = { studentNo: 'SCANNER-1', name: 'Scanner verification', course: 'IT', year: '1', section: '', uid: '0B1F3254', active: true };
  const saved = await request('/students', { method: 'POST', body, staff }); assert.equal(saved.status, 201);
  capture = await start(); assert.equal((await scan(capture.data.id)).data.state, 'conflict'); await cancel(capture.data.id);
  capture = await start({ studentId: saved.data.id });
  assert.equal((await scan(capture.data.id)).data.state, 'captured'); await cancel(capture.data.id);
  capture = await start({ studentId: saved.data.id });
  assert.equal((await scan(capture.data.id, 'ABCDEF01')).data.state, 'captured'); await cancel(capture.data.id);
  assert.equal((await request('/students/' + saved.data.id, { method: 'PUT', body: { ...body, uid: 'ABCDEF01' }, staff })).status, 200);
  assert.equal((await db.query('SELECT rfid_uid FROM students WHERE id=$1', [saved.data.id])).rows[0].rfid_uid, 'ABCDEF01');
  assert.equal((await request('/students', { method: 'POST', body: { ...body, studentNo: 'SCANNER-2', uid: 'ABCDEF01' }, staff })).status, 409);
  capture = await start(); await cancel(capture.data.id);
  assert.equal((await scan(capture.data.id)).status, 410);
  capture = await start();
  await db.query('DELETE FROM sessions WHERE token_hash=$1', [staff.hash]);
  assert.equal((await scan(capture.data.id)).status, 410);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM entry_logs')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM scan_events')).rows[0].n, 0);
});
