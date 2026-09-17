const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

try {
  writeFileSync(path.join(__dirname, '../.env'),
    `HOST=127.0.0.1\nPORT=4000\nDEVICE_ID=gate-01\nDEVICE_API_KEY=${randomBytes(32).toString('hex')}\n`,
    { flag: 'wx', mode: 0o600 });
  console.log('[SETUP] Created backend/.env with a random device key. Existing files are never overwritten.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('[SETUP] backend/.env already exists; kept existing configuration.');
  else throw error;
}
