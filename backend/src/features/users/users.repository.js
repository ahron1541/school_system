const { randomUUID } = require('node:crypto');
const view = (row) => ({
  id: row.id, username: row.username, fullName: row.full_name, role: row.role,
  active: row.active, mustChangePassword: row.must_change_password,
  temporaryPasswordExpiresAt: row.temporary_password_expires_at,
  lockedUntil: row.locked_until, version: row.account_version,
  createdAt: row.created_at, updatedAt: row.updated_at,
  activeSessions: Number(row.active_sessions || 0),
});
function createUsersRepository(db) {
  async function list(input) {
    return db.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const where = "WHERE position(lower($1) in lower(u.username || ' ' || u.full_name)) > 0 AND ($2='' OR u.role=$2) AND ($3='' OR u.active=($3='active'))";
      const values = [input.search, input.role, input.status];
      const total = Number((await client.query('SELECT count(*) FROM users u ' + where, values)).rows[0].count);
      const order = { fullName: 'lower(u.full_name)', username: 'u.username', createdAt: 'u.created_at DESC' }[input.sort];
      const { rows } = await client.query(`SELECT u.id,u.username,u.full_name,u.role,u.active,u.must_change_password,
        u.temporary_password_expires_at,u.locked_until,u.account_version,u.created_at,u.updated_at,
        (SELECT count(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS active_sessions
        FROM users u ${where} ORDER BY ${order},u.id LIMIT $4 OFFSET $5`, [...values, input.limit, (input.page - 1) * input.limit]);
      return { accounts: rows.map(view), pagination: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
    });
  }
  const lockManagement = (client) => client.query('SELECT pg_advisory_xact_lock(7914002)');
  async function actor(client, identity) {
    return (await client.query(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND s.token_hash=$2 AND s.expires_at>now() FOR UPDATE OF u`, [identity.id, identity.sessionHash])).rows[0];
  }
  const find = async (client, id) => (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
  const administratorCount = async (client) => Number((await client.query("SELECT count(*) FROM users WHERE active AND role='ADMIN' AND NOT must_change_password")).rows[0].count);
  async function insert(client, input, hash) {
    return (await client.query(`INSERT INTO users(id,username,full_name,role,password_hash,must_change_password,temporary_password_expires_at)
      VALUES($1,$2,$3,$4,$5,true,now()+interval '24 hours') RETURNING *`, [randomUUID(), input.username, input.fullName, input.role, hash])).rows[0];
  }
  async function update(client, id, next) {
    return (await client.query(`UPDATE users SET full_name=$2,role=$3,active=$4,account_version=account_version+1,updated_at=now()
      WHERE id=$1 RETURNING *`, [id, next.fullName, next.role, next.active])).rows[0];
  }
  async function reset(client, id, hash) {
    return (await client.query(`UPDATE users SET password_hash=$2,must_change_password=true,
      temporary_password_expires_at=now()+interval '24 hours',failed_attempts=0,locked_until=NULL,
      account_version=account_version+1,updated_at=now() WHERE id=$1 RETURNING *`, [id, hash])).rows[0];
  }
  const revoke = (client, id) => client.query('DELETE FROM sessions WHERE user_id=$1', [id]);
  const bumpVersion = (client, id) => client.query('UPDATE users SET account_version=account_version+1,updated_at=now() WHERE id=$1 RETURNING *', [id]);
  const audit = (client, actorId, action, targetId) => client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, action, targetId]);
  return { list, lockManagement, actor, find, administratorCount, insert, update, reset, revoke, bumpVersion, audit };
}
module.exports = { createUsersRepository, view };
