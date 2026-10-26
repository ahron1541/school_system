const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const { createApp } = require('../../app/app');
const { createDatabase } = require('../../database/client');
const { scanArguments, sendScan } = require('../../../scripts/record-scan');

test('scan simulator validates inputs and preserves explicitly supplied retry IDs', () => {
  const scan = scanArguments(['abcdef01', '--event-id', 'tap-1'], 'gate-01');
  assert.deepEqual(scan, { uid: 'ABCDEF01', deviceId: 'gate-01', eventId: 'tap-1' });
  assert.notEqual(scanArguments(['ABCDEF01'], 'gate-01').eventId, scanArguments(['ABCDEF01'], 'gate-01').eventId);
  for (const args of [[], ['ABCDEF01', 'extra'], ['invalid'], ['ABCDEF01', '--event-id', ''], ['ABCDEF01', '--unknown']]) {
    assert.throws(() => scanArguments(args, 'gate-01'));
  }
});

test('persistent scan API: concurrent taps, retries, restart, validation and database failure', async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Configure DATABASE_URL and start the local database for integration tests.');
  const schema = 'test_entry_' + randomUUID().replaceAll('-', '');
  const admin = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2500 });
  let db;
  let server;
  let created = false;
  t.after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await db?.close();
    if (created) await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
    await admin.end();
  });
  await admin.connect();
  await admin.query('CREATE SCHEMA ' + schema);
  created = true;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('options', '-c search_path=' + schema);
  db = createDatabase(url.toString());
  const folder = path.join(__dirname, '../../database/migrations');
  for (const name of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.query(await readFile(path.join(folder, name), 'utf8'));
  }
  const studentId = randomUUID();
  await db.query("INSERT INTO students(id,student_no,full_name,rfid_uid,course,year_level) VALUES($1,'SCAN-TEST','Scan Test','ABCDEF01','IT','1')", [studentId]);
  const config = { deviceId: 'gate-01', deviceKey: randomBytes(32).toString('hex'), databaseUrl: url.toString() };
  async function start(database = db) {
    server = createApp(config, { db: database, log: () => {} }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    config.port = server.address().port;
  }
  async function request(body, key = config.deviceKey) {
    const response = await fetch(`http://127.0.0.1:${config.port}/api/entry-logs/scan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Key': key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, body: await response.json() };
  }
  async function counts() {
    return (await db.query('SELECT (SELECT count(*)::int FROM entry_logs) AS entries,(SELECT count(*)::int FROM scan_events) AS scans,(SELECT count(*)::int FROM sync_outbox) AS changes')).rows[0];
  }
  await start();
  const scan = scanArguments(['abcdef01', '--event-id', 'tap-one'], config.deviceId);
  assert.equal((await request(scan, '')).status, 401);
  assert.equal((await request({ ...scan, deviceId: 'other' })).status, 403);
  for (const body of [{}, { ...scan, uid: 'NOTHEX' }, { ...scan, deviceId: undefined }, { ...scan, eventId: undefined }, { ...scan, timestamp: new Date().toISOString() }]) {
    assert.equal((await request(body)).status, 422);
  }
  assert.equal((await request({ ...scan, uid: 'A'.repeat(2200) })).status, 413);
  assert.deepEqual(await counts(), { entries: 0, scans: 0, changes: 0 });

  // These are actual HTTP requests to the real transactional PostgreSQL path.
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => sendScan(config, scan)));
  assert.equal(concurrent.filter((r) => r.httpStatus === 201).length, 1);
  assert.equal(concurrent.filter((r) => r.result.data.duplicate).length, 5);
  assert.ok(concurrent.every((r) => r.result.data.type === 'IN'));
  assert.deepEqual(await counts(), { entries: 1, scans: 1, changes: 1 });
  const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => sendScan(config, { ...scan, eventId: 'burst-' + i })));
  assert.ok(burst.every((r) => r.result.data.status === 'ignored'));
  assert.deepEqual(await counts(), { entries: 1, scans: 6, changes: 1 });
  assert.equal((await request({ ...scan, uid: 'FFFFFFFF' })).status, 409);

  await new Promise((resolve) => server.close(resolve));
  await start();
  const replay = await sendScan(config, scan);
  assert.equal(replay.httpStatus, 200);
  assert.equal(replay.result.data.duplicate, true);
  assert.equal(replay.result.data.receivedAt, concurrent[0].result.data.receivedAt);
  assert.deepEqual(await counts(), { entries: 1, scans: 6, changes: 1 });

  const previous = new Date(Date.now() - 11000);
  await db.query('UPDATE entry_logs SET scanned_at=$1 WHERE student_id=$2', [previous, studentId]);
  const next = await sendScan(config, { ...scan, eventId: 'next-tap' });
  const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
  assert.equal(next.result.data.type, day(previous) === day(new Date(next.result.data.receivedAt)) ? 'OUT' : 'IN');
  assert.equal((await counts()).entries, 2);
  await db.query('UPDATE students SET active=false WHERE id=$1', [studentId]);
  assert.equal((await sendScan(config, { ...scan, eventId: 'inactive' })).result.data.status, 'blocked');
  assert.equal((await sendScan(config, { ...scan, uid: 'FFFFFFFF', eventId: 'unknown' })).result.data.status, 'unknown');
  assert.equal((await counts()).entries, 2);

  const beforeFailure = await counts();
  await new Promise((resolve) => server.close(resolve));
  const unavailableUrl = new URL(url); unavailableUrl.port = '1';
  const unavailable = createDatabase(unavailableUrl.toString());
  try {
    await start(unavailable);
    const failure = await sendScan(config, { ...scan, eventId: 'retry-after-outage' });
    assert.equal(failure.httpStatus, 503);
    assert.equal(failure.result.error.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!JSON.stringify(failure.result).includes('postgresql://'));
    assert.deepEqual(await counts(), beforeFailure);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await unavailable.close();
  }
  await start();
  const recovered = await sendScan(config, { ...scan, eventId: 'retry-after-outage' });
  assert.equal(recovered.httpStatus, 201);
  assert.equal(recovered.result.data.duplicate, false);
  assert.equal(recovered.result.data.status, 'blocked');
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(sendScan(config, { ...scan, eventId: 'server-unavailable' }));
});
