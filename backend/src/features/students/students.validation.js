const { ApiError } = require("../../shared/middleware/error-handler");
const { validateProfile, profileName } = require('./profile.validation');
const studentView = (row) => ({ id: row.id, studentNo: row.student_no, name: row.full_name, course: row.course, year: row.year_level, section: row.section, uid: row.rfid_uid || '', active: row.active, initials: row.full_name.split(/\s+/).slice(0,2).map((part) => part[0]).join(''), photo: row.has_photo ? '/api/students/' + row.id + '/photo' : '' });
function validateStudent(body) {
  const limits = { studentNo: 50, name: 120, course: 120, year: 30, section: 40, uid: 20 };
  if (!body || Object.keys(body).some((key) => ![...Object.keys(limits), 'active', 'profile'].includes(key))) throw new ApiError(422, 'INVALID_STUDENT', 'Invalid student fields.');
  const profile = body.profile === undefined ? undefined : validateProfile(body.profile);
  const result = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = key === 'name' && profile ? profileName(profile) : body[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > max || (!['section','uid'].includes(key) && !value.trim())) {
      const labels = { studentNo: 'Student ID', name: 'Full name', course: 'Course / program', year: 'Year level', section: 'Section', uid: 'RFID UID' };
      const error = new ApiError(422, 'INVALID_STUDENT', `${labels[key]} must contain ${['section','uid'].includes(key) ? 'at most' : '1 to'} ${max} characters.`);
      error.fields = { [key === 'name' && profile ? 'profile.givenName' : key]: error.message }; throw error;
    }
    result[key] = value.trim();
  }
  result.uid = result.uid.toUpperCase();
  if (result.uid && !/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(result.uid)) {
    const error = new ApiError(422, 'INVALID_UID', 'RFID UID must contain 8, 14 or 20 hexadecimal characters.');
    error.fields = { uid: error.message }; throw error;
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') throw new ApiError(422, 'INVALID_STUDENT', 'Enrollment status must be true or false.');
  return { ...result, active: body.active ?? true, ...(profile ? { profile } : {}) };
}
module.exports = { studentView, validateStudent };
