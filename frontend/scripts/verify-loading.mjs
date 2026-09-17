import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Only this isolated browser context sees these transport fixtures. No database writes.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const base = process.env.UI_URL || 'http://127.0.0.1:5173';
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let signedIn = false;
let loginCalls = 0;
let saveCalls = 0;
let studentDelay = 1800;
let failStudents = false;
let eventDelay = 2200;
let guardDelay = 1000;
let reports = [];
const student = { id: '00000000-0000-4000-8000-000000000001', name: 'Loading Test Student', studentNo: 'LOADING-TEST', course: 'Test course', year: '1', section: 'A', uid: '', active: true, initials: 'LT', photo: '/api/students/00000000-0000-4000-8000-000000000001/photo' };
const actor = { id: 'test-admin', username: 'testadmin', fullName: 'Test Administrator', role: 'ADMIN' };
async function reply(route, data, status = 200) {
  try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: 'Unable to retrieve records. Please try again.', error: { code: 'TEST_UNAVAILABLE' } }) }); } catch { /* The component may cancel a request during navigation. */ }
}
await context.route('**/api/**', async (route) => {
  const url = new URL(route.request().url()); const path = url.pathname; const method = route.request().method();
  if (path === '/api/auth/me') { await pause(400); return reply(route, { user: actor, csrfToken: 'test-csrf' }, signedIn ? 200 : 401); }
  if (path === '/api/auth/login') { loginCalls++; await pause(700); signedIn = true; return reply(route, { user: actor, csrfToken: 'test-csrf' }); }
  if (path === '/api/auth/logout') { await pause(600); signedIn = false; return reply(route, null); }
  if (path === '/api/students' && method === 'GET') { await pause(studentDelay); return reply(route, [student], failStudents ? 503 : 200); }
  if (path.endsWith('/photo') && method === 'GET') { await pause(600); return reply(route, null, 404); }
  if (path.endsWith('/photo') && method === 'PUT') { await pause(1000); return reply(route, { photo: student.photo }); }
  if (path.startsWith('/api/students') && ['PUT','POST'].includes(method)) { saveCalls++; await pause(900); return reply(route, student); }
  if (path === '/api/entry-logs') { await pause(eventDelay); return reply(route, url.searchParams.get('date') === '2000-01-01' ? [] : [{ id: 'event-1', person: student, direction: 'IN', alert: false, time: '08:00:00', gate: 'gate-01' }]); }
  if (path === '/api/violations' && method === 'GET') return reply(route, reports);
  if (path === '/api/violations' && method === 'POST') { await pause(900); reports = [{ id: 'report-1', studentId: student.id, studentNo: student.studentNo, name: student.name, description: route.request().postDataJSON().description, status: 'ACTIVE', reportedBy: actor.fullName, createdAt: new Date().toISOString() }]; return reply(route, { id: 'report-1' }, 201); }
  if (path.endsWith('/clear')) { await pause(900); reports[0].status = 'CLEARED'; return reply(route, null); }
  if (path === '/api/system/status') { await pause(800); return reply(route, { api: { state: 'connected' }, database: { state: 'connected', latencyMs: 4 }, device: { state: 'never_seen', deviceId: 'gate-01' }, checkedAt: new Date().toISOString(), sync: { pending: 0 } }); }
  if (path.startsWith('/api/guard/')) { await pause(guardDelay); return reply(route, { scan: null, totals: { entries: 0, exits: 0, alerts: 0 }, recent: [], serverTime: new Date().toISOString(), device: { deviceId: 'gate-01', connection: 'never_seen' } }); }
  return reply(route, null, 404);
});
await mkdir('artifacts', { recursive: true });
try {
  await page.goto(base);
  await expect(page.getByText('Preparing your workspace...', { exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('testadmin');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  const login = page.getByRole('button', { name: 'Sign in', exact: true }); const loginWidth = (await login.boundingBox()).width;
  await login.click();
  const signingIn = page.getByRole('button', { name: 'Signing in...', exact: true });
  await expect(signingIn).toBeDisabled(); assert.equal((await signingIn.boundingBox()).width, loginWidth);
  await page.locator('.login-form').evaluate((form) => form.requestSubmit());
  await expect(page.getByRole('heading', { name: 'Gate overview', exact: true })).toBeVisible();
  assert.equal(loginCalls, 1);
  await expect(page.getByRole('status', { name: 'Retrieving attendance totals', exact: true })).toBeVisible();
  assert.equal(await page.getByText('No gate activity', { exact: true }).count(), 0);
  await page.screenshot({ path: 'artifacts/overview-loading.png', fullPage: true });
  const sidebar = await page.locator('.sidebar').boundingBox(); const toggle = await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).boundingBox();
  assert.ok(toggle.y < sidebar.y + 100, 'Collapse belongs in the sidebar header');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/sidebar-header-collapsed.png', fullPage: true });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Students', exact: true }).click();
  await expect(page.locator('.person-button').filter({ hasText: student.name })).toBeVisible();
  studentDelay = 800; failStudents = true;
  await page.getByRole('button', { name: 'Refresh students', exact: true }).click();
  await expect(page.getByText('Refreshing students...', { exact: true })).toBeVisible();
  assert.equal(await page.locator('.loading-region').count(), 0, 'Retain existing table while refreshing');
  await expect(page.getByText(/Showing previously retrieved records/)).toBeVisible();
  await expect(page.locator('.person-button').filter({ hasText: student.name })).toBeVisible();
  failStudents = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retrying...', exact: true })).toBeDisabled();
  await expect(page.getByText(/Showing previously retrieved records/)).toHaveCount(0);
  await expect(page.locator('.avatar .photo-fallback').first()).toBeVisible();
  await page.getByRole('button', { name: 'Register student', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Student number *', { exact: true }).fill('TEST');
  await dialog.getByLabel('Full name *', { exact: true }).fill('Test Name');
  await dialog.getByLabel('Course / program *', { exact: true }).fill('Test course');
  await dialog.getByLabel('Year level *', { exact: true }).fill('1');
  const saveWidth = (await dialog.getByRole('button', { name: 'Save student', exact: true }).boundingBox()).width;
  await dialog.getByRole('button', { name: 'Save student', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Saving student...', exact: true })).toBeDisabled();
  assert.equal((await dialog.getByRole('button', { name: 'Saving student...', exact: true }).boundingBox()).width, saveWidth);
  await dialog.locator('form').evaluate((form) => form.requestSubmit());
  await expect(dialog).toHaveCount(0); assert.equal(saveCalls, 1);
  await expect(page.getByText('Student saved.', { exact: true })).toBeVisible();
  await page.locator('.person-button').filter({ hasText: student.name }).click();
  await page.getByRole('button', { name: 'Edit student', exact: true }).click();
  await page.getByLabel('Student photo', { exact: true }).setInputFiles('public/images/student-1.jpg');
  await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Uploading photo...', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save student', exact: true })).toBeDisabled();
  await expect(page.getByText('Photo saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Violations', exact: true }).click();
  await page.getByRole('combobox', { name: 'Student', exact: true }).selectOption(student.id);
  await page.getByLabel('Description', { exact: true }).fill('Test incident description');
  await page.getByRole('button', { name: 'Record violation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recording violation...', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Clear violation', exact: true })).toBeEnabled({ timeout: 10000 });
  await page.getByRole('button', { name: 'Clear violation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clearing...', exact: true })).toBeDisabled();
  await expect(page.getByText('Violation cleared.', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Gate activity', exact: true }).click();
  eventDelay = 1000;
  await page.getByLabel('Activity date', { exact: true }).fill('2000-01-01');
  await expect(page.getByRole('status', { name: 'Retrieving gate activity', exact: true })).toBeVisible();
  assert.equal(await page.locator('.person-button').count(), 0, 'Do not show the previous date under a new heading');
  assert.equal(await page.getByText('No gate activity', { exact: true }).count(), 0);
  await expect(page.getByRole('heading', { name: 'No gate activity', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Guard post', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Retrieving gate totals', exact: true })).toBeVisible();
  const animation = await page.locator('.skeleton').first().evaluate((node) => getComputedStyle(node).animationName);
  assert.equal(animation, 'none');
  await page.screenshot({ path: 'artifacts/guard-loading.png', fullPage: true });
  guardDelay = 0;
  await expect(page.getByRole('heading', { name: 'Ready for the next scan' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: 'artifacts/sidebar-header-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/sidebar-mobile-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Close sidebar' }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS: initialization, independent skeletons, stable buttons, duplicate prevention, upload feedback, clearance, refresh/error/retry, correct empty states, image fallback, date changes, reduced motion and sidebar placement.');
} catch (error) {
  console.error('Browser errors:', errors);
  await page.screenshot({ path: 'artifacts/loading-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
