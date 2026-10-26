const bcrypt = require('bcryptjs');
const { ApiError } = require('../../shared/middleware/error-handler');
const { createUsersRepository, view } = require('./users.repository');

function createUsersService(db) {
  const repository = createUsersRepository(db);
  async function authorize(client, identity, password) {
    // Serialize account changes, then recheck authority inside the transaction.
    await repository.lockManagement(client);
    const actor = await repository.actor(client, identity);
    if (!actor || !actor.active || actor.role !== 'ADMIN' || actor.must_change_password) throw new ApiError(403, 'ADMIN_ACCESS_CHANGED', 'Your administrator access changed. Sign in again.');
    if (!await bcrypt.compare(password, actor.password_hash)) throw new ApiError(403, 'ADMIN_PASSWORD_INCORRECT', 'Your administrator password is incorrect.');
  }
  async function target(client, id, version) {
    const user = await repository.find(client, id);
    if (!user) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
    if (user.account_version !== version) throw new ApiError(409, 'ACCOUNT_CHANGED', 'This account changed. Close this dialog, refresh the list and try again.');
    return user;
  }
  async function create(input, identity) {
    try {
      return await db.transaction(async (client) => {
        await authorize(client, identity, input.adminPassword);
        const row = await repository.insert(client, input, await bcrypt.hash(input.temporaryPassword, 12));
        await repository.audit(client, identity.id, 'ACCOUNT_CREATED', row.id);
        return view(row);
      });
    } catch (error) {
      if (error.code === '23505') throw new ApiError(409, 'USERNAME_TAKEN', 'This username is already in use.');
      throw error;
    }
  }
  async function update(id, input, identity) {
    return db.transaction(async (client) => {
      await authorize(client, identity, input.adminPassword);
      const user = await target(client, id, input.version);
      const next = { fullName: input.fullName ?? user.full_name, role: input.role ?? user.role, active: input.active ?? user.active };
      if (user.active && user.role === 'ADMIN' && !user.must_change_password && (!next.active || next.role !== 'ADMIN') && await repository.administratorCount(client) <= 1) {
        throw new ApiError(409, 'LAST_ADMINISTRATOR', 'The last administrator cannot be deactivated or demoted.');
      }
      if (id === identity.id && (!next.active || next.role !== user.role)) throw new ApiError(409, 'SELF_ACCESS_CHANGE', 'Another administrator must change your role or deactivate your account.');
      const actions = [];
      if (next.fullName !== user.full_name) actions.push('ACCOUNT_PROFILE_UPDATED');
      if (next.role !== user.role) actions.push('ACCOUNT_ROLE_CHANGED');
      if (next.active !== user.active) actions.push(next.active ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED');
      if (!actions.length) return { account: view(user), sessionsRevoked: false };
      const row = await repository.update(client, id, next);
      await repository.revoke(client, id);
      for (const action of actions) await repository.audit(client, identity.id, action, id);
      return { account: view(row), sessionsRevoked: true };
    });
  }
  async function resetPassword(id, input, identity) {
    return db.transaction(async (client) => {
      await authorize(client, identity, input.adminPassword);
      await target(client, id, input.version);
      if (id === identity.id) throw new ApiError(409, 'USE_ACCOUNT_SETTINGS', 'Change your own password in Account settings.');
      const row = await repository.reset(client, id, await bcrypt.hash(input.temporaryPassword, 12));
      await repository.revoke(client, id);
      await repository.audit(client, identity.id, 'ACCOUNT_PASSWORD_RESET', id);
      return view(row);
    });
  }
  async function revokeSessions(id, input, identity) {
    return db.transaction(async (client) => {
      await authorize(client, identity, input.adminPassword);
      await target(client, id, input.version);
      await repository.revoke(client, id);
      const { rows } = await repository.bumpVersion(client, id);
      await repository.audit(client, identity.id, 'ACCOUNT_SESSIONS_REVOKED', id);
      return view(rows[0]);
    });
  }
  return { list: repository.list, create, update, resetPassword, revokeSessions };
}
module.exports = { createUsersService };
