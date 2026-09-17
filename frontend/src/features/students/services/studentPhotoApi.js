import { api } from '../../../shared/lib/api';

export const uploadStudentPhoto = (studentId, file) => api(`/students/${studentId}/photo`, { method: 'PUT', body: file });
