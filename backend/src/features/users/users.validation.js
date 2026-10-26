const { ApiError } = require('../../shared/middleware/error-handler');
const roles = ['ADMIN', 'GUARD', 'REGISTRAR', 'DISCIPLINE'];
const invalid = (message) => { throw new ApiError(422, 'INVALID_ACCOUNT', message); };
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) invalid('Invalid account fields.');
}
function password(value, temporary = false) {
  if (typeof value !== 'string' || value.length < (temporary ? 12 : 1) || Buffer.byteLength(value) > 72) invalid(temporary ? 'Temporary password must be at least 12 characters and at most 72 bytes.' : 'Enter your administrator password.');
  return value;
}
function fullName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) invalid('Enter a full name of 1-120 characters.');
  return value.trim();
}
function role(value) { if (!roles.includes(value)) invalid('Choose a valid role.'); return value; }
function version(value) { if (!Number.isSafeInteger(value) || value < 1) invalid('Reload the account before making changes.'); return value; }
function accountId(value) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) invalid('Invalid account ID.');
  return value;
}
function createInput(body) {
  object(body, ['username', 'fullName', 'role', 'temporaryPassword', 'adminPassword']);
  if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,50}$/.test(body.username.trim())) invalid('Username must have 3-50 letters, digits, dots, underscores or hyphens.');
  return { username: body.username.trim().toLowerCase(), fullName: fullName(body.fullName), role: role(body.role), temporaryPassword: password(body.temporaryPassword, true), adminPassword: password(body.adminPassword) };
}
function updateInput(body) {
  object(body, ['fullName', 'role', 'active', 'version', 'adminPassword']);
  const input = { version: version(body.version), adminPassword: password(body.adminPassword) };
  if (!['fullName', 'role', 'active'].some((key) => body[key] !== undefined)) invalid('Choose at least one account field to update.');
  if (body.fullName !== undefined) input.fullName = fullName(body.fullName);
  if (body.role !== undefined) input.role = role(body.role);
  if (body.active !== undefined) { if (typeof body.active !== 'boolean') invalid('Account status must be true or false.'); input.active = body.active; }
  return input;
}
function actionInput(body, reset = false) {
  object(body, ['adminPassword', 'version', ...(reset ? ['temporaryPassword'] : [])]);
  return { adminPassword: password(body.adminPassword), version: version(body.version), ...(reset ? { temporaryPassword: password(body.temporaryPassword, true) } : {}) };
}
function listInput(query) {
  object(query, ['search', 'role', 'status', 'page', 'limit', 'sort']);
  const number = (key, fallback, max) => {
    const value = query[key] ?? String(fallback);
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) invalid('Invalid ' + key + '.');
    return Number(value);
  };
  const search = query.search ?? '';
  if (typeof search !== 'string' || search.length > 100) invalid('Search must be at most 100 characters.');
  const selectedRole = query.role ?? '';
  if (selectedRole !== '' && !roles.includes(selectedRole)) invalid('Invalid role filter.');
  const status = query.status ?? '';
  if (!['', 'active', 'inactive'].includes(status)) invalid('Invalid status filter.');
  const sort = query.sort ?? 'fullName';
  if (!['fullName', 'username', 'createdAt'].includes(sort)) invalid('Invalid sort field.');
  return { search: search.trim(), role: selectedRole, status, sort, page: number('page', 1, 1000000), limit: number('limit', 25, 100) };
}
module.exports = { createInput, updateInput, actionInput, listInput, accountId };
