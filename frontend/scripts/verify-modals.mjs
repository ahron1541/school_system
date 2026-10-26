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
const id = randomUUID(), otherId = randomUUID(), username = 'modal_'+randomBytes(5).toString('hex'), password = randomBytes(18).toString('hex');
const base = process.env.UI_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1250, height: 720 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
await mkdir('artifacts', { recursive: true });
async function login(name = username) {
  await page.setViewportSize({ width: 1250, height: 720 });
  await page.getByLabel('Username', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeAttached();
}
async function navigate(name) { await page.setViewportSize({ width: 1250, height: 720 }); await page.getByRole('navigation').getByRole('link', { name, exact: true }).click(); }
async function layout(name) {
  for (const [width,height] of [[1250,720],[900,560],[390,844]]) {
    await page.setViewportSize({ width,height });
    const result = await page.locator('.app-modal').evaluate((dialog) => {
      const box = dialog.getBoundingClientRect(), footer = dialog.querySelector('.modal-footer').getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight+1 && footer.top >= box.top && footer.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth;
    });
    assert.ok(result, 'Dialog and actions fit the viewport');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
    await page.screenshot({ path: `artifacts/modal-${name}-${width}.png` });
  }
}
try {
  const hash = await bcrypt.hash(password,4);
  for (const [actor,name] of [[id,username],[otherId,username+'_other']]) await db.query('INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,$2,$3,$4,$5)', [actor,name,'Modal Verification','ADMIN',hash]);
  await page.goto(base); await login(); await navigate('Account management');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('draft.staff');
  await page.getByLabel('Full name', { exact: true }).fill('Unfinished Staff');
  await page.getByLabel('Temporary password', { exact: true }).fill('Do-not-store-this-secret');
  assert.ok(!(await page.evaluate(() => JSON.stringify(sessionStorage))).includes('Do-not-store-this-secret'));
  await layout('account');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep editing' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume draft' }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Unfinished Staff');
  await expect(page.getByLabel('Temporary password', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume draft' })).toHaveCount(0);
  await navigate('Students'); await page.getByRole('button', { name: 'Register student' }).click();
  await page.getByLabel('Student number *', { exact: true }).fill('UNSAVED-ONLY');
  await page.getByLabel('Full name *', { exact: true }).fill('Unfinished Student');
  await layout('student'); await page.reload();
  await page.getByRole('button', { name: 'Resume draft' }).click();
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Unfinished Student');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Expire authentication without explicit logout: preserve the first user's tab draft.
  await db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
  await page.reload(); await login(username+'_other'); await navigate('Students');
  await expect(page.getByRole('button', { name: 'Resume draft' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await login(); await navigate('Students');
  await expect(page.getByRole('button', { name: 'Resume draft' })).toBeVisible();
  await page.evaluate(() => { for (const key of Object.keys(sessionStorage).filter((key) => key.startsWith('gate-draft-v1:'))) { const draft = JSON.parse(sessionStorage.getItem(key)); draft.savedAt = Date.now()-9*60*60*1000; sessionStorage.setItem(key, JSON.stringify(draft)); } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Register student' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume draft' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Register student' }).click();
  await page.getByLabel('Full name *', { exact: true }).fill('Logout cleanup');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('gate-draft-v1:')).length), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: compact modals, fixed actions, mobile layouts, refresh recovery, password exclusion, close warning, discard, session interruption, user isolation and logout cleanup.');
} finally {
  await browser.close();
  await db.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])', [[id,otherId]]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [[id,otherId]]);
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[id,otherId]]);
  await db.end();
}
