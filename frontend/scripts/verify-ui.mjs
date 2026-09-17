import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Client } = require('pg');
const base = process.env.UI_URL || 'http://127.0.0.1:5173';
const accountsText = await readFile(new URL('../../.local/initial-accounts.md',import.meta.url),'utf8');
const accounts = Object.fromEntries([...accountsText.matchAll(/Username: (\S+)\r?\nPassword: (\S+)/g)].map((match)=>[match[1],match[2]]));
const browser = await chromium.launch({ channel:'msedge',headless:true });
const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page = await context.newPage();
const errors=[];
page.on('pageerror',(error)=>errors.push(error.message));
await mkdir('artifacts',{recursive:true});
const testNo='UI-'+Date.now();
let testId;
const env=parseEnv(await readFile(new URL('../../backend/.env',import.meta.url),'utf8'));
const db=new Client({connectionString:env.DATABASE_URL});
await db.connect();
async function signIn(username, remember=false) {
  await page.getByLabel('Username',{exact:true}).fill(username);
  await page.getByLabel('Password',{exact:true}).fill(accounts[username]);
  await page.getByRole('checkbox',{name:'Keep me signed in for 7 days'}).setChecked(remember);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
}
try {
  await page.goto(base);
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  assert.equal(await page.getByRole('navigation').count(),0);
  assert.equal((await context.request.get(base+'/api/students')).status(),401);
  await page.screenshot({path:'artifacts/login-light.png',fullPage:true});
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await page.screenshot({path:'artifacts/login-dark.png',fullPage:true});
  await signIn('admin',true);
  await page.getByRole('heading',{name:'Gate overview',exact:true}).waitFor();
  await page.getByText('Connected',{exact:true}).first().waitFor();
  const cookies=await context.cookies();
  const cookie=cookies.find((item)=>item.name==='gate_session');
  assert.equal(cookie.httpOnly,true);
  assert.equal(cookie.sameSite,'Strict');
  assert.ok(cookie.expires-Date.now()/1000>6*24*3600);
  assert.equal(await page.evaluate(()=>document.cookie.includes('gate_session')),false);
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();
  assert.equal(await page.locator('.main-shell').evaluate((element)=>getComputedStyle(element).marginLeft),'76px');
  await page.reload();
  await page.getByRole('heading',{name:'Gate overview',exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('.main-shell').evaluate((element)=>getComputedStyle(element).marginLeft),'76px');
  await page.screenshot({path:'artifacts/admin-dark-collapsed.png',fullPage:true});
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await page.getByRole('button',{name:'Switch to light mode'}).click();
  await page.getByRole('navigation').getByRole('link',{name:'Students',exact:true}).click();
  await page.getByRole('button',{name:'Register student',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Student number *',{exact:true}).fill(testNo);
  await dialog.getByLabel('Full name *',{exact:true}).fill('Browser Verification Record');
  await dialog.getByLabel('Course / program *',{exact:true}).fill('Verification');
  await dialog.getByLabel('Year level *',{exact:true}).fill('1');
  await dialog.getByLabel('Section',{exact:true}).fill('A');
  await dialog.getByRole('button',{name:'Save student',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('.person-button').filter({hasText:'Browser Verification Record'}).waitFor();
  testId=(await db.query('SELECT id FROM students WHERE student_no=$1',[testNo])).rows[0].id;
  await page.reload();
  await page.getByRole('navigation').getByRole('link',{name:'Students',exact:true}).click();
  await page.locator('.person-button').filter({hasText:'Browser Verification Record'}).waitFor();
  await page.locator('.person-button').filter({hasText:'Browser Verification Record'}).click();
  await page.getByRole('button',{name:'Edit student',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Section',{exact:true}).fill('B');
  await page.getByRole('dialog').getByRole('button',{name:'Save student',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.locator('.person-button').filter({hasText:'Browser Verification Record'}).waitFor();
  assert.equal((await db.query('SELECT section FROM students WHERE id=$1',[testId])).rows[0].section,'B');
  await page.getByRole('navigation').getByRole('link',{name:'System status',exact:true}).click();
  await page.getByRole('heading',{name:'Database is connected',exact:true}).waitFor();
  await page.screenshot({path:'artifacts/system-connected.png',fullPage:true});
  const state=await context.storageState();
  const restored=await browser.newContext({storageState:state});
  const restoredPage=await restored.newPage();
  await restoredPage.goto(base);
  await restoredPage.getByRole('heading',{name:'Gate overview',exact:true}).waitFor();
  await restoredPage.getByRole('button',{name:'Log out',exact:true}).click();
  await restoredPage.getByRole('heading',{name:'Welcome back'}).waitFor();
  assert.equal((await context.request.get(base+'/api/auth/me')).status(),401);
  await restored.close();
  await page.reload();
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  for (const [username,heading] of [['guard','Guard post'],['registrar','Students'],['discipline','Violations']]) {
    await signIn(username);
    await page.getByRole('heading',{name:heading,exact:true}).waitFor();
    assert.equal((await context.cookies()).find((item)=>item.name==='gate_session').expires,-1);
    assert.equal(await page.getByRole('navigation').getByRole('link',{name:'System status',exact:true}).count(),0);
    assert.equal((await context.request.get(base+'/api/system/status')).status(),403);
    await page.getByRole('button',{name:'Log out',exact:true}).click();
    await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  }
  for (const width of [390,768]) {
    await page.setViewportSize({width,height:844});
    await page.screenshot({path:'artifacts/login-'+width+'.png',fullPage:true});
    await signIn('admin');
    await page.getByRole('heading',{name:'Gate overview',exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'artifacts/admin-'+width+'.png',fullPage:true});
    for (const [label, heading] of [['Students','Students'],['System status','System status'],['Violations','Violations']]) {
      if (width === 390) await page.getByRole('button',{name:'Open navigation'}).click();
      await page.getByRole('navigation').getByRole('link',{name:label,exact:true}).click();
      if (label === 'System status') await page.getByRole('heading',{name:'Database is connected',exact:true}).waitFor();
      else await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      await page.screenshot({path:'artifacts/admin-'+label.replaceAll(' ','-').toLowerCase()+'-'+width+'.png',fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), label + ' must fit at ' + width);
    }
    if(width===390) {
      await page.getByRole('button',{name:'Open navigation'}).click();
      await page.getByRole('navigation').getByRole('link',{name:'Account settings',exact:true}).click();
      await page.getByRole('heading',{name:'Account settings',exact:true}).waitFor();
      await page.getByRole('button',{name:'Use night mode'}).click();
      await page.screenshot({path:'artifacts/account-mobile-dark.png',fullPage:true});
      await page.getByRole('button',{name:'Open navigation'}).click();
    }
    await page.getByRole('button',{name:'Log out',exact:true}).click();
    await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: real login, 7-day/session cookies, reload/restoration, revocation, role access, student persistence/edit, themes, collapse and mobile layouts.');
} catch (error) {
  console.error('Browser feedback:', await page.locator('[role="alert"]').allTextContents());
  console.error('Browser errors:', errors);
  await page.screenshot({path:'artifacts/ui-failure.png',fullPage:true});
  throw error;
} finally {
  // Remove only the uniquely identified record created by this browser test.
  if (!testId) testId=(await db.query('SELECT id FROM students WHERE student_no=$1',[testNo])).rows[0]?.id;
  if(testId) {
    await db.query('BEGIN');
    try {
      await db.query('DELETE FROM sync_outbox WHERE entity_type=$1 AND entity_id=$2',['students',testId]);
      await db.query('DELETE FROM audit_logs WHERE target_id=$1',[testId]);
      await db.query('DELETE FROM students WHERE id=$1 AND student_no=$2',[testId,testNo]);
      await db.query('COMMIT');
    } catch(error) { await db.query('ROLLBACK'); throw error; }
  }
  await db.end();
  await browser.close();
}
