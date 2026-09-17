const bcrypt = require('bcryptjs');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const csrfFor = (token) => digest(`csrf:${token}`);
const publicUser = (row) => ({ id: row.id, username: row.username, fullName: row.full_name, role: row.role });
const dummyHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);

function createAuthService(db) {
  async function login(username, password, remember) {
    const outcome = await db.transaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM users WHERE username=$1 FOR UPDATE', [username.toLowerCase()]);
      const user = rows[0];
      const valid = await bcrypt.compare(password, user?.password_hash || dummyHash);
      if (!user || !user.active || (user.locked_until && new Date(user.locked_until) > new Date()) || !valid) {
        if (user && (!user.locked_until || new Date(user.locked_until) <= new Date())) {
          const count = user.locked_until ? 1 : user.failed_attempts + 1;
          await client.query("UPDATE users SET failed_attempts=$2,locked_until=CASE WHEN $2>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE id=$1", [user.id, count]);
        }
        await client.query('INSERT INTO audit_logs(id,actor_id,action) VALUES($1,$2,$3)', [randomUUID(), user?.id || null, 'LOGIN_FAILED']);
        return null;
      }
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (remember ? 7 * 24 : 8) * 60 * 60 * 1000);
      await client.query('DELETE FROM sessions WHERE expires_at<=now()');
      await client.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [digest(token), user.id, expiresAt]);
      await client.query('UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=$1', [user.id]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action) VALUES($1,$2,$3)', [randomUUID(), user.id, 'LOGIN']);
      return { token, user: publicUser(user), expiresAt, csrfToken: csrfFor(token) };
    });
    if (!outcome) throw new ApiError(401, 'INVALID_LOGIN', 'Invalid credentials or account temporarily unavailable.');
    return outcome;
  }
  async function session(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'NOT_AUTHENTICATED', 'Please sign in.');
    const { rows } = await db.query('SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true', [digest(token)]);
    if (!rows[0]) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in.');
    return { user: publicUser(rows[0]), csrfToken: csrfFor(token), expiresAt: rows[0].expires_at };
  }
  async function logout(token) { await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token || '')]); }
  async function changePassword(userId, current, next) {
    const valid = await db.transaction(async (client) => {
      const { rows } = await client.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (!await bcrypt.compare(current, rows[0].password_hash)) return false;
      await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [userId, await bcrypt.hash(next, 12)]);
      await client.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action) VALUES($1,$2,$3)', [randomUUID(), userId, 'PASSWORD_CHANGED']);
      return true;
    });
    if (!valid) throw new ApiError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
  }
  return { login, session, logout, changePassword };
}
module.exports = { createAuthService };
