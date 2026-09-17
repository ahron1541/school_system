import { api } from '../../../shared/lib/api';
export const getSystemStatus = (signal) => api('/system/status', { signal });
