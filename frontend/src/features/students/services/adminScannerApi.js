import { api } from '../../../shared/lib/api';
export const adminScannerApi = {
  start: (studentId) => api('/admin-scanner/captures', { method: 'POST', body: studentId ? { studentId } : {} }),
  read: (id) => api('/admin-scanner/captures/' + encodeURIComponent(id)),
  cancel: (id) => api('/admin-scanner/captures/' + encodeURIComponent(id), { method: 'DELETE' }),
};
