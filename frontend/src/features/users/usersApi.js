import { api } from '../../shared/lib/api';
export const createAccount = (body) => api('/users', { method: 'POST', body });
export const updateAccount = (id, body) => api('/users/' + id, { method: 'PATCH', body });
export const resetAccountPassword = (id, body) => api('/users/' + id + '/password-reset', { method: 'POST', body });
export const revokeAccountSessions = (id, body) => api('/users/' + id + '/revoke-sessions', { method: 'POST', body });
export const roleNames = { ADMIN: 'Administrator', GUARD: 'Guard', REGISTRAR: 'Registrar', DISCIPLINE: 'Discipline officer' };
