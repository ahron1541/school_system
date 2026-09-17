const { randomBytes, randomUUID } = require('node:crypto');
const { mkdirSync, appendFileSync } = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/database/client');

async function seed() {
  const db = createDatabase(process.env.DATABASE_URL);
  const local = path.resolve(__dirname, '../../.local');
  mkdirSync(local, { recursive: true });
  try {
    for (const [username, role, name] of [['admin','ADMIN','System Administrator'],['guard','GUARD','Gate Guard'],['registrar','REGISTRAR','Student Registrar'],['discipline','DISCIPLINE','Discipline Officer']]) {
      if ((await db.query('SELECT id FROM users WHERE username=$1', [username])).rowCount) continue;
      const password = randomBytes(15).toString('base64url');
      const hash = await bcrypt.hash(password, 12);
      await db.query('INSERT INTO users(id,username,full_name,password_hash,role) VALUES($1,$2,$3,$4,$5)', [randomUUID(), username, name, hash, role]);
      appendFileSync(path.join(local, 'initial-accounts.md'), `\n## ${role}\nUsername: ${username}\nPassword: ${password}\n`, { mode: 0o600 });
    }
    console.log('[ACCOUNTS] Accounts ready. Initial credentials are in .local/initial-accounts.md; existing passwords were not changed.');
  } finally { await db.close(); }
}
seed().catch(() => { console.error('[ACCOUNTS] Setup failed. Check database/migrations.'); process.exitCode = 1; });
