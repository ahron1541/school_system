const { randomUUID } = require('node:crypto');
const { readEnv } = require('../src/shared/config/env');
async function main() {
  const config = readEnv();
  const uid = process.argv[2];
  if (!uid) throw new Error('Usage: npm run scan -- CARD_UID');
  const response = await fetch(`http://127.0.0.1:${config.port}/api/entry-logs/scan`, { method:'POST', headers:{ 'Content-Type':'application/json','X-Device-Key':config.deviceKey }, body:JSON.stringify({ uid,deviceId:config.deviceId,eventId:randomUUID() }), signal:AbortSignal.timeout(8000) });
  const result = await response.json();
  console.log(JSON.stringify(result,null,2));
  if (!response.ok) process.exitCode = 1;
}
main().catch(() => { console.error('[SCAN] Provide a valid UID and check the server/database. This command records real gate activity.'); process.exitCode=1; });
