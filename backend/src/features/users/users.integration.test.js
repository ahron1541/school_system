const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID, randomBytes } = require('node:crypto');
const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const { createApp } = require('../../app/app');
const { createDatabase } = require('../../database/client');
const { createInput, updateInput, listInput, actionInput } = require('./users.validation');

test('account validation rejects unknown fields, invalid roles, passwords and pagination', () => {
  const input = { username: 'Staff.One', fullName: 'Staff One', role: 'GUARD', temporaryPassword: 'Temporary-test-only-123', adminPassword: 'test-only' };
  assert.equal(createInput(input).username, 'staff.one');
  for (const change of [{ role: 'OWNER' }, { fullName: ' ' }, { username: '../bad' }, { active: true }, { temporaryPassword: 'short' }, { temporaryPassword: '\u00e9'.repeat(40) }]) assert.throws(() => createInput({ ...input, ...change }));
  for (const query of [{ page: '0' }, { limit: '101' }, { page: ['1','2'] }, { sort: 'password_hash' }, { role: 'OWNER' }, { extra: '' }, { search: 'a'.repeat(101) }]) assert.throws(() => listInput(query));
  assert.equal(listInput({}).limit, 25);
  assert.throws(() => updateInput({ active: 'false', version: 1, adminPassword: 'secret' }));
  assert.throws(() => updateInput({ password_hash: 'bad', version: 1, adminPassword: 'secret' }));
  assert.throws(() => actionInput({ version: 0, adminPassword: 'secret' }));
});

test('real accounts: admin-only lifecycle, forced password change, revocation, pagination and concurrent safeguards', async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Start PostgreSQL and configure DATABASE_URL.');
  const schema = 'test_users_' + randomUUID().replaceAll('-', '');
  const owner = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2500 });
  let db; let server; let created = false;
  t.after(async () => { if (server?.listening) await new Promise((resolve) => server.close(resolve)); await db?.close(); if (created) await owner.query('DROP SCHEMA ' + schema + ' CASCADE'); await owner.end(); });
  await owner.connect(); await owner.query('CREATE SCHEMA ' + schema); created = true;
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('options', '-c search_path=' + schema);
  db = createDatabase(url.toString());
  const folder = path.join(__dirname, '../../database/migrations');
  for (const name of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) await db.query(await readFile(path.join(folder, name), 'utf8'));
  const password = randomBytes(18).toString('hex');
  const hash = await bcrypt.hash(password, 4);
  const ids = {};
  for (const role of ['ADMIN','GUARD','REGISTRAR','DISCIPLINE']) {
    ids[role] = randomUUID();
    await db.query('INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [ids[role], role.toLowerCase(), role, role, hash]);
  }
  server = createApp({ deviceId: 'gate-01', deviceKey: randomBytes(32).toString('hex'), databaseUrl: url.toString() }, { db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  async function request(route, { method = 'GET', body, session, csrf = true } = {}) {
    const response = await fetch(base + route, { method, headers: { Origin: 'http://127.0.0.1:5173', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Cookie: session.cookie, ...(csrf ? { 'X-CSRF-Token': session.csrf } : {}) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  async function login(username, pass = password) {
    const r = await request('/auth/login', { method: 'POST', body: { username, password: pass, remember: true } });
    assert.equal(r.status, 200, 'sign-in succeeds');
    return { cookie: r.cookie.split(';')[0], header: r.cookie, csrf: r.body.data.csrfToken, user: r.body.data.user };
  }
  assert.equal((await request('/users')).status, 401);
  const admin = await login('admin');
  for (const role of ['guard','registrar','discipline']) {
    const session = await login(role);
    for (const [route, method] of [['/users','GET'], ['/users','POST'], ['/users/'+ids.ADMIN,'PATCH'], ['/users/'+ids.ADMIN+'/password-reset','POST'], ['/users/'+ids.ADMIN+'/revoke-sessions','POST']]) assert.equal((await request(route, { session, method, body: method === 'GET' ? undefined : {} })).status, 403);
  }
  const temporary = randomBytes(18).toString('hex');
  const input = { username: 'New.Staff', fullName: 'New Staff', role: 'GUARD', temporaryPassword: temporary, adminPassword: password };
  assert.equal((await request('/users', { method: 'POST', body: input, session: admin, csrf: false })).status, 403);
  assert.equal((await request('/users', { method: 'POST', body: { ...input, adminPassword: 'wrong' }, session: admin })).body.error.code, 'ADMIN_PASSWORD_INCORRECT');
  const last = await request('/users/' + ids.ADMIN, { method: 'PATCH', session: admin, body: { role: 'GUARD', version: 1, adminPassword: password } });
  assert.equal(last.body.error.code, 'LAST_ADMINISTRATOR');
  const saved = await request('/users', { method: 'POST', session: admin, body: input });
  assert.equal(saved.status, 201); assert.equal(saved.body.data.mustChangePassword, true);
  assert.ok(!JSON.stringify(saved.body).includes(temporary));
  const id = saved.body.data.id;
  assert.equal((await request('/users', { method: 'POST', session: admin, body: { ...input, username: 'new.staff' } })).status, 409);
  const stored = (await db.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
  assert.ok(await bcrypt.compare(temporary, stored.password_hash));
  assert.notEqual(stored.password_hash, temporary);
  let staff = await login('new.staff', temporary);
  assert.equal(staff.user.mustChangePassword, true); assert.ok(!staff.header.includes('Max-Age'));
  for (const route of ['/students','/users','/guard/dashboard','/violations']) assert.equal((await request(route, { session: staff })).body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await request('/auth/me', { session: staff })).status, 200);
  assert.equal((await request('/auth/password', { method: 'POST', session: staff, body: { currentPassword: temporary, newPassword: temporary } })).status, 422);
  const personal = randomBytes(18).toString('hex');
  assert.equal((await request('/auth/password', { method: 'POST', session: staff, body: { currentPassword: temporary, newPassword: personal } })).status, 200);
  assert.equal((await request('/auth/me', { session: staff })).status, 401);
  staff = await login('new.staff', personal);
  assert.equal(staff.user.mustChangePassword, false);
  assert.equal((await request('/guard/dashboard', { session: staff })).status, 200);
  const row = async () => (await request('/users?search=new.staff', { session: admin })).body.data.accounts[0];
  let account = await row();
  assert.equal(account.activeSessions, 1);
  assert.equal((await request('/users/'+id+'/revoke-sessions', { method: 'POST', session: admin, body: { version: account.version, adminPassword: password } })).status, 200);
  assert.equal((await request('/auth/me', { session: staff })).status, 401);
  staff = await login('new.staff', personal); account = await row();
  assert.equal((await request('/users/'+id, { method: 'PATCH', session: admin, body: { role: 'REGISTRAR', version: account.version, adminPassword: password } })).status, 200);
  assert.equal((await request('/auth/me', { session: staff })).status, 401);
  staff = await login('new.staff', personal);
  assert.equal(staff.user.role, 'REGISTRAR'); assert.equal((await request('/guard/dashboard', { session: staff })).status, 403);
  account = await row();
  const edits = await Promise.all(['First Edit','Second Edit'].map((fullName) => request('/users/'+id, { method: 'PATCH', session: admin, body: { fullName, version: account.version, adminPassword: password } })));
  assert.deepEqual(edits.map((r) => r.status).sort(), [200,409]);
  account = await row();
  assert.equal((await request('/users/'+id, { method: 'PATCH', session: admin, body: { active: false, version: account.version, adminPassword: password } })).status, 200);
  assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'new.staff', password: personal } })).status, 401);
  account = await row();
  await request('/users/'+id, { method: 'PATCH', session: admin, body: { active: true, version: account.version, adminPassword: password } });
  staff = await login('new.staff', personal); account = await row();
  const reset = randomBytes(18).toString('hex');
  assert.equal((await request('/users/'+id+'/password-reset', { method: 'POST', session: admin, body: { temporaryPassword: reset, version: account.version, adminPassword: password } })).status, 200);
  assert.equal((await request('/auth/me', { session: staff })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'new.staff', password: personal } })).status, 401);
  staff = await login('new.staff', reset);
  await db.query("UPDATE users SET temporary_password_expires_at=now()-interval '1 second' WHERE id=$1", [id]);
  assert.equal((await request('/auth/me', { session: staff })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'new.staff', password: reset } })).status, 401);
  assert.equal((await request('/users/'+ids.ADMIN+'/password-reset', { method: 'POST', session: admin, body: { temporaryPassword: reset, version: 1, adminPassword: password } })).body.error.code, 'USE_ACCOUNT_SETTINGS');

  for (let i = 0; i < 30; i++) await db.query('INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [randomUUID(), 'page_'+String(i).padStart(2,'0'), 'Page Account', 'GUARD', hash]);
  const first = await request('/users?search=page_&limit=25&page=1&sort=username', { session: admin });
  const second = await request('/users?search=page_&limit=25&page=2&sort=username', { session: admin });
  assert.equal(first.body.data.pagination.total, 30); assert.equal(first.body.data.accounts.length, 25); assert.equal(second.body.data.accounts.length, 5);
  assert.equal(new Set([...first.body.data.accounts,...second.body.data.accounts].map((r) => r.id)).size, 30);
  assert.ok(!JSON.stringify(first.body).includes('password_hash'));
  assert.equal((await request('/users?search=%27%20OR%201=1--', { session: admin })).body.data.pagination.total, 0);
  assert.equal((await request('/users?page=1&page=2', { session: admin })).status, 422);
  const actions = (await db.query('SELECT action FROM audit_logs WHERE target_id=$1', [id])).rows.map((r) => r.action);
  for (const action of ['ACCOUNT_CREATED','ACCOUNT_SESSIONS_REVOKED','ACCOUNT_ROLE_CHANGED','ACCOUNT_DEACTIVATED','ACCOUNT_ACTIVATED','ACCOUNT_PASSWORD_RESET']) assert.ok(actions.includes(action));
  assert.equal(Number((await db.query('SELECT count(*) FROM sync_outbox')).rows[0].count), 0, 'passwords/accounts are not put into the sync outbox');

  const otherId = randomUUID();
  await db.query("INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,'other_admin','Other Admin','ADMIN',$2)", [otherId,hash]);
  const other = await login('other_admin');
  const concurrent = await Promise.all([[admin,otherId],[other,ids.ADMIN]].map(([session,target]) => request('/users/'+target, { method: 'PATCH', session, body: { role: 'GUARD', version: 1, adminPassword: password } })));
  assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
  assert.equal(concurrent.filter((r) => [401,403].includes(r.status)).length, 1, 'the losing actor no longer has an authorized session');
  assert.equal(Number((await db.query("SELECT count(*) FROM users WHERE active AND role='ADMIN' AND NOT must_change_password")).rows[0].count), 1);
});
