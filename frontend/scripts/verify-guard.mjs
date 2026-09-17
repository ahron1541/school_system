import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const env = parseEnv(await readFile(new URL('../../backend/.env', import.meta.url), 'utf8'));
const db = new Client({ connectionString: env.DATABASE_URL }); await db.connect();
const base = process.env.UI_URL || 'http://127.0.0.1:5173';
const suffix = randomBytes(5).toString('hex');
const password = randomBytes(18).toString('hex');
const actors = [];
const scanIds = [];
const studentNo = 'GUARD-UI-' + suffix;
const uid = randomBytes(7).toString('hex').toUpperCase();
let studentId;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts', { recursive: true });
async function login(role) {
  await page.goto(base);
  await page.getByLabel('Username', { exact: true }).fill('test_' + role.toLowerCase() + '_' + suffix);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function scan(card = uid) {
  const eventId = 'guard-ui-' + randomUUID(); scanIds.push(eventId);
  const response = await context.request.post(base + '/api/entry-logs/scan', { headers: { 'X-Device-Key': env.DEVICE_API_KEY }, data: { deviceId: env.DEVICE_ID, uid: card, eventId } });
  assert.equal(response.status(), 201);
  return (await response.json()).data;
}
async function fits(target) { assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page-level horizontal overflow'); }
try {
  for (const role of ['ADMIN','GUARD']) {
    const id = randomUUID(); actors.push(id);
    await db.query('INSERT INTO users(id,username,full_name,password_hash,role) VALUES($1,$2,$3,$4,$5)', [id,'test_' + role.toLowerCase() + '_' + suffix,'Browser Test ' + role,await bcrypt.hash(password,4),role]);
  }
  await login('ADMIN');
  await page.getByRole('navigation').getByRole('link', { name: 'Students', exact: true }).click();
  await page.getByRole('button', { name: 'Register student', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Student number *', { exact: true }).fill(studentNo);
  await dialog.getByLabel('Full name *', { exact: true }).fill('Guard Browser Verification');
  await dialog.getByLabel('Course / program *', { exact: true }).fill('Verification');
  await dialog.getByLabel('Year level *', { exact: true }).fill('1');
  await dialog.getByLabel('RFID UID', { exact: true }).fill(uid);
  await dialog.getByRole('button', { name: 'Save student', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  studentId = (await db.query('SELECT id FROM students WHERE student_no=$1', [studentNo])).rows[0].id;
  await page.locator('.person-button').filter({ hasText: 'Guard Browser Verification' }).click();
  await page.getByRole('button', { name: 'Edit student', exact: true }).click();
  await page.getByLabel('Student photo', { exact: true }).setInputFiles('public/images/student-1.jpg');
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save student', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM student_photos WHERE student_id=$1', [studentId])).rows[0].n, 1);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await login('GUARD');
  await expect(page.getByRole('heading', { name: 'Guard post', exact: true })).toBeVisible();
  const popup = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Open scan display' }).click();
  const display = await popup; display.on('pageerror', (error) => errors.push(error.message));
  await display.waitForLoadState();
  assert.equal(await display.getByRole('navigation').count(), 0);
  await scan();
  await expect(display.getByRole('heading', { name: 'Guard Browser Verification', exact: true })).toBeVisible();
  await expect(display.getByRole('img')).toBeVisible();
  await display.waitForFunction(() => document.querySelector('.scan-photo img')?.naturalWidth > 0);
  await page.screenshot({ path: 'artifacts/guard-desktop.png', fullPage: true });
  await display.screenshot({ path: 'artifacts/scan-display-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Report violation', exact: true }).first().click();
  await expect(page.getByRole('combobox', { name: 'Student', exact: true })).toHaveValue(studentId);
  await page.getByLabel('Description', { exact: true }).fill('Private browser test incident');
  await page.getByRole('button', { name: 'Record violation', exact: true }).click();
  await expect(page.getByText('Violation recorded.', { exact: true })).toBeVisible();
  assert.equal(await page.getByRole('button', { name: 'Clear violation', exact: true }).count(), 0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report', exact: true }).click();
  const downloaded = await download;
  assert.ok((await readFile(await downloaded.path(), 'utf8')).includes('Private browser test incident'));
  await db.query("UPDATE entry_logs SET scanned_at=now()-interval '11 seconds' WHERE student_id=$1", [studentId]);
  await scan();
  await expect(display.getByRole('heading', { name: 'Guard Browser Verification', exact: true })).toBeVisible();
  assert.equal(await display.getByText(/Private browser test incident|Active violation/).count(), 0);
  for (const width of [390,768]) {
    await page.setViewportSize({ width, height: 844 });
    await fits(page); await page.screenshot({ path: 'artifacts/guard-reports-' + width + '.png', fullPage: true });
    await display.setViewportSize({ width, height: 844 });
    await fits(display); await display.screenshot({ path: 'artifacts/scan-display-' + width + '.png', fullPage: true });
  }
  await display.getByRole('button', { name: 'Switch to dark mode' }).click();
  await display.screenshot({ path: 'artifacts/scan-display-dark.png', fullPage: true });
  await expect(display.getByRole('heading', { name: 'Ready for the next scan' })).toBeVisible({ timeout: 18000 });
  await scan('FFFFFFFF');
  await expect(display.getByText('Card not registered', { exact: true })).toBeVisible();
  assert.equal(await display.getByRole('img').count(), 0);
  await context.setOffline(true);
  await expect(display.getByRole('heading', { name: 'Display unavailable' })).toBeVisible({ timeout: 10000 });
  assert.equal(await display.getByRole('img').count(), 0);
  await context.setOffline(false);
  await expect(display.getByRole('heading', { name: 'Display unavailable' })).toHaveCount(0, { timeout: 10000 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('navigation').getByRole('link', { name: 'Guard post', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guard post', exact: true })).toBeVisible();
  for (const width of [390,768]) { await page.setViewportSize({ width, height: 844 }); await fits(page); await page.screenshot({ path: 'artifacts/guard-' + width + '.png', fullPage: true }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: 'artifacts/guard-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(display.getByRole('heading', { name: 'Display locked', exact: true })).toBeVisible({ timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log('PASS: guard dashboard, uploaded photo, two-window scan, report/export, mobile/tablet, themes, expiry, unknown card, offline recovery and logout lock.');
} finally {
  await context.setOffline(false);
  if (!studentId) studentId = (await db.query('SELECT id FROM students WHERE student_no=$1', [studentNo])).rows[0]?.id;
  await db.query('BEGIN');
  try {
    const reportIds = studentId ? (await db.query('SELECT id FROM violations WHERE student_id=$1', [studentId])).rows.map((row) => row.id) : [];
    const entryIds = studentId ? (await db.query('SELECT id FROM entry_logs WHERE student_id=$1', [studentId])).rows.map((row) => row.id) : [];
    await db.query('DELETE FROM sync_outbox WHERE entity_id=ANY($1::uuid[])', [[...reportIds,...entryIds,...(studentId ? [studentId] : [])]]);
    await db.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])', [actors]);
    if (studentId) { await db.query('DELETE FROM violations WHERE student_id=$1', [studentId]); await db.query('DELETE FROM entry_logs WHERE student_id=$1', [studentId]); }
    await db.query('DELETE FROM scan_events WHERE device_id=$1 AND event_id=ANY($2::text[])', [env.DEVICE_ID, scanIds]);
    if (studentId) await db.query('DELETE FROM students WHERE id=$1 AND student_no=$2', [studentId, studentNo]);
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [actors]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  await db.end(); await browser.close();
}
