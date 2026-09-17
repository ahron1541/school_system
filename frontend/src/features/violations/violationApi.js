import { api } from '../../shared/lib/api';

export const reportViolation = (input) => api('/violations', { method: 'POST', body: input });
export const clearViolation = (id) => api('/violations/' + id + '/clear', { method: 'PATCH', body: {} });
