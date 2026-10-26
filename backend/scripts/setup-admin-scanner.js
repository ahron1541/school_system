const { randomBytes } = require('node:crypto');
const { readFileSync, appendFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const path = require('node:path');
const envPath = path.join(__dirname, '../.env');
const source = readFileSync(envPath, 'utf8');
const env = parseEnv(source);
let key = env.ADMIN_SCANNER_API_KEY;
if (key && !/^[a-f0-9]{64}$/.test(key)) {
  throw new Error('ADMIN_SCANNER_API_KEY is invalid. Correct that setting before running scanner:setup.');
}
if (!key) {
  key = randomBytes(32).toString('hex');
  if (key !== undefined && env.ADMIN_SCANNER_API_KEY === '') {
    const updated = source.replace(/^\s*(?:export\s+)?ADMIN_SCANNER_API_KEY\s*=.*$/m, 'ADMIN_SCANNER_API_KEY=' + key);
    if (parseEnv(updated).ADMIN_SCANNER_API_KEY !== key) throw new Error('Cannot safely update the blank scanner setting. Remove that line and retry.');
    writeFileSync(envPath, updated);
  } else appendFileSync(envPath, '\nADMIN_SCANNER_API_KEY=' + key + '\n');
}
const folder = path.join(__dirname, '../../.local');
mkdirSync(folder, { recursive: true });
writeFileSync(path.join(folder, 'admin-scanner-provisioning.txt'), 'PRIVATE: do not share or commit this file.\nPaste this line into Serial Monitor with echo OFF:\n\nbackend key ' + key + '\n', { mode: 0o600 });
console.log('[SCANNER] Configuration ready. Restart the backend. Open .local/admin-scanner-provisioning.txt privately to provision the scanner; the key is not printed here.');
