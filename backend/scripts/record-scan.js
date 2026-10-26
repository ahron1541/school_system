const { randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');
const { readEnv } = require('../src/shared/config/env');
const { validateScan } = require('../src/features/devices/device.validation');

function scanArguments(args, deviceId) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { 'event-id': { type: 'string' } } });
  if (positionals.length !== 1) throw new Error('Provide exactly one card UID.');
  return validateScan({ uid: positionals[0], deviceId, eventId: values['event-id'] ?? randomUUID() });
}

async function sendScan(config, scan) {
  const response = await fetch(`http://127.0.0.1:${config.port}/api/entry-logs/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Key': config.deviceKey },
    body: JSON.stringify(scan),
    signal: AbortSignal.timeout(8000),
  });
  return { httpStatus: response.status, retryAfter: response.headers.get('retry-after'), result: await response.json() };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run scan -- CARD_UID [--event-id UNIQUE_TAP_ID]');
    console.log('Records real gate activity. Reuse the SAME event ID and UID only when retrying the SAME tap.');
    return;
  }
  const config = readEnv();
  const scan = scanArguments(process.argv.slice(2), config.deviceId);
  // Print before delivery so a timeout does not lose the retry identifier.
  console.log('[SCAN] This command writes real records. Event ID: ' + scan.eventId);
  console.log('[SCAN] If delivery is uncertain, retry with --event-id ' + scan.eventId + ' and the same UID.');
  const { httpStatus, retryAfter, result } = await sendScan(config, scan);
  const data = result.data || {};
  console.log(JSON.stringify({ httpStatus, eventId: scan.eventId, message: result.message, status: data.status, type: data.type, duplicate: data.duplicate, receivedAt: data.receivedAt, error: result.error?.code, retryAfter }, null, 2));
  if (httpStatus >= 400 || !result.success) process.exitCode = 1;
}
if (require.main === module) main().catch(() => {
  console.error('[SCAN] Delivery was not confirmed. Check the UID, event ID and server/database. Run npm run scan -- --help for usage.');
  process.exitCode = 1;
});

module.exports = { scanArguments, sendScan };
