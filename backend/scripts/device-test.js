const { randomUUID } = require('node:crypto');
const { readEnv } = require('../src/shared/config/env');

async function main() {
  const config = readEnv();
  const base = `http://127.0.0.1:${config.port}/api`;
  const headers = { 'Content-Type': 'application/json', 'X-Device-Key': config.deviceKey };
  const scan = { uid: process.argv[2] || 'A1B2C3D4', deviceId: config.deviceId, eventId: randomUUID() };
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    console.log(JSON.stringify({ httpStatus: response.status, ...result }, null, 2));
    if (!response.ok) throw new Error(result.message);
  }
  await request('/health');
  await request(`/devices/${config.deviceId}/heartbeat`, 'PUT');
  await request('/devices/test-scans', 'POST', scan);
  await request('/devices/test-scans', 'POST', scan);
  await request(`/devices/${config.deviceId}/status`);
}

main().catch(() => {
  console.error('[TEST] Request failed. Check server availability, .env, UID format and the response above.');
  process.exitCode = 1;
});
