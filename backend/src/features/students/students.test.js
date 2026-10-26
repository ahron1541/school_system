const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const sharp = require('sharp');
const { createApp } = require('../../app/app');
const { createDatabase } = require('../../database/client');
const { validateStudent } = require('./students.validation');

const basic = { studentNo: 'PROFILE-1', name: 'Legacy Name', course: 'BSIT', year: '4', section: 'A', uid: '', active: true };
const profile = { givenName: 'Ana', lastName: 'Dela Cruz', dateOfBirth: '2004-02-29', email: 'ana@example.test', homeAddress: 'Private address', medication: 'Private medication', family: { siblings: [{ name: 'Sibling', contactNumber: '+63 (900) 000-0000' }] }, education: { elementary: { name: 'School', email: 'school@example.test' } } };
test('profile validation preserves legacy API and rejects malformed private fields', () => {
  assert.equal(validateStudent(basic).name, 'Legacy Name');
  assert.equal(validateStudent({ ...basic, profile }).name, 'Ana Dela Cruz');
  for (const invalid of [{ ...profile, dateOfBirth: '2003-02-29' }, { ...profile, dateOfBirth: '9999-01-01' }, { ...profile, email: 'bad' }, { ...profile, givenName: '' }, { ...profile, education: { elementary: { email: 'bad' } } }, { ...profile, family: { siblings: Array(21).fill({}) } }, { ...profile, unexpected: 'value' }]) assert.throws(() => validateStudent({ ...basic, profile: invalid }), { status: 422 });
});

test('real student API: profile persistence, private projections, legacy update, photos and conflicts', async t => {
  const admin = new Client({ connectionString: process.env.DATABASE_URL }); await admin.connect();
  const schema = 'test_profiles_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE SCHEMA ' + schema);
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('options', '-c search_path=' + schema);
  const db = createDatabase(url.toString()); let server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await db.close(); await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end(); });
  const folder = path.join(__dirname, '../../database/migrations');
  for (const file of (await readdir(folder)).filter(name => name.endsWith('.sql')).sort()) await db.query(await readFile(path.join(folder, file), 'utf8'));
  server = createApp({ deviceKey: randomBytes(32).toString('hex') }, { db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  async function request(route, staff, method = 'GET', body) {
    const response = await fetch(base + route, { method, headers: { ...(staff ? { Cookie: staff.cookie, 'X-CSRF-Token': staff.csrf || '' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...(await response.json()) };
  }
  async function session(role) {
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    await db.query('INSERT INTO users(id,username,full_name,password_hash,role) VALUES($1,$2,$2,$3,$4)', [id, id, 'unused', role]);
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), id]);
    const staff = { cookie: 'gate_session=' + token }; staff.csrf = (await request('/auth/me', staff)).data.csrfToken; return staff;
  }
  const owner = await session('ADMIN'), registrar = await session('REGISTRAR'), guard = await session('GUARD'), discipline = await session('DISCIPLINE');
  const created = await request('/students', owner, 'POST', { ...basic, profile }); assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await request('/students/' + id)).status, 401);
  for (const staff of [owner, registrar]) {
    const detail = await request('/students/' + id, staff); assert.equal(detail.data.profile.medication, 'Private medication'); assert.equal(detail.data.name, 'Ana Dela Cruz');
    const list = await request('/students', staff); assert.equal(list.data[0].email, profile.email); assert.equal(list.data[0].profile, undefined); assert.ok(!JSON.stringify(list.data).includes('Private medication'));
  }
  for (const staff of [guard, discipline]) {
    assert.equal((await request('/students/' + id, staff)).data.profile, undefined);
    assert.equal((await request('/students', staff)).data[0].email, undefined);
    assert.equal((await request('/students/' + id, staff, 'PUT', { ...basic, profile })).status, 403);
  }
  assert.equal((await request('/students/' + id, owner, 'PUT', { ...basic, name: 'Ana Dela Cruz', uid: 'ABCDEF01' })).status, 200);
  assert.equal((await request('/students/' + id, owner)).data.profile.medication, profile.medication);
  assert.equal((await request('/students/' + id, owner, 'PUT', basic)).status, 409);
  assert.equal((await request('/students', owner, 'POST', { ...basic, profile })).status, 409);
  const invalid = await request('/students/' + id, owner, 'PUT', { ...basic, profile: { ...profile, email: 'bad' } });
  assert.equal(invalid.status, 422); assert.ok(invalid.error.fields['profile.email']);
  const legacy = await request('/students', owner, 'POST', { ...basic, studentNo: 'LEGACY-1' });
  assert.equal((await request('/students/' + legacy.data.id, owner)).data.profile, null);
  assert.equal((await request('/students/' + legacy.data.id, owner, 'PUT', { ...basic, studentNo: 'LEGACY-1', profile })).status, 200);
  const image = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#335544' } }).png().toBuffer();
  const photo = await fetch(base + '/students/' + id + '/photo', { method: 'PUT', headers: { Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'image/png' }, body: image }); assert.equal(photo.status, 200);
  assert.equal((await fetch(base + '/students/' + id + '/photo')).status, 401);
  const thumbnail = await fetch(base + '/students/' + id + '/photo?size=thumbnail', { headers: { Cookie: guard.cookie } });
  assert.equal(thumbnail.status, 200); const metadata = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata(); assert.equal(metadata.width, 96); assert.equal(metadata.height, 96);
  assert.equal((await request('/students/' + id, owner)).data.photo, '/api/students/' + id + '/photo');
  assert.ok(!(await db.query('SELECT payload FROM sync_outbox')).rows.some(row => JSON.stringify(row.payload).includes('Private medication')));
});
