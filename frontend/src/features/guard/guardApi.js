import { api } from '../../shared/lib/api';

export const getGuardState = (display, signal) => api(display ? '/guard/display' : '/guard/dashboard', { signal });
