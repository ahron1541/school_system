const { ApiError } = require("../../shared/middleware/error-handler");
const studentView = (row) => ({ id: row.id, studentNo: row.student_no, name: row.full_name, course: row.course, year: row.year_level, section: row.section, uid: row.rfid_uid || '', active: row.active, initials: row.full_name.split(/\s+/).slice(0,2).map((part) => part[0]).join(''), photo: row.has_photo ? '/api/students/' + row.id + '/photo' : '' });
function validateStudent(body) {
  const limits = { studentNo: 50, name: 120, course: 120, year: 30, section: 40, uid: 20 };
  if (!body || Object.keys(body).some((key) => ![...Object.keys(limits), 'active'].includes(key))) throw new ApiError(422, 'INVALID_STUDENT', 'Invalid student fields.');
  const result = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > max || (!['section','uid'].includes(key) && !value.trim())) throw new ApiError(422, 'INVALID_STUDENT', `Provide a valid ${key} (maximum ${max} characters).`);
    result[key] = value.trim();
  }
  result.uid = result.uid.toUpperCase();
  if (result.uid && !/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(result.uid)) throw new ApiError(422, 'INVALID_UID', 'RFID UID must contain 8, 14 or 20 hexadecimal characters.');
  if (body.active !== undefined && typeof body.active !== 'boolean') throw new ApiError(422, 'INVALID_STUDENT', 'Enrollment status must be true or false.');
  return { ...result, active: body.active ?? true };
}
module.exports = { studentView, validateStudent };
