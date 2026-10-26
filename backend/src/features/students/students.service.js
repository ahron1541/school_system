const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const { studentView } = require('./students.validation');
const { profileName } = require('./profile.validation');
function createStudentService(db) {
  async function list(privateAccess = false) {
    const rows = (await db.query(`SELECT s.*,EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) AS has_photo${privateAccess ? ",p.data->>'email' AS email,p.data->>'contactNumber' AS contact_number" : ''} FROM students s ${privateAccess ? 'LEFT JOIN student_profiles p ON p.student_id=s.id' : ''} ORDER BY full_name LIMIT 1000`)).rows;
    return rows.map(row => ({ ...studentView(row), ...(row.has_photo ? { photo: '/api/students/' + row.id + '/photo?size=thumbnail' } : {}), ...(privateAccess ? { email: row.email || '', contactNumber: row.contact_number || '' } : {}) }));
  }
  async function read(id, privateAccess = false) {
    const { rows } = await db.query('SELECT s.*,EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) AS has_photo FROM students s WHERE s.id=$1', [id]);
    if (!rows[0]) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
    const result = studentView(rows[0]);
    if (privateAccess) result.profile = (await db.query('SELECT data FROM student_profiles WHERE student_id=$1', [id])).rows[0]?.data ?? null;
    return result;
  }
  async function save(input, actorId, existingId) {
    const id = existingId || randomUUID();
    try {
      return await db.transaction(async (client) => {
        const values = [id, input.studentNo, input.name, input.uid || null, input.course, input.year, input.section, input.active];
        const sql = existingId ? 'UPDATE students SET student_no=$2,full_name=$3,rfid_uid=$4,course=$5,year_level=$6,section=$7,active=$8,updated_at=now() WHERE id=$1 RETURNING *' : 'INSERT INTO students(id,student_no,full_name,rfid_uid,course,year_level,section,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *';
        const { rows } = await client.query(sql, values);
        if (!rows[0]) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
        if (input.profile) await client.query('INSERT INTO student_profiles(student_id,data) VALUES($1,$2) ON CONFLICT(student_id) DO UPDATE SET data=$2,updated_at=now()', [id, input.profile]);
        else if (existingId) {
          const stored = (await client.query('SELECT data FROM student_profiles WHERE student_id=$1', [id])).rows[0]?.data;
          if (stored && profileName(stored) !== input.name) throw new ApiError(409, 'PROFILE_NAME_REQUIRED', 'Edit the structured name in the student profile.');
        }
        await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'students', id, rows[0]]);
        await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, existingId ? 'STUDENT_UPDATED' : 'STUDENT_CREATED', id]);
        return studentView(rows[0]);
      });
    } catch (error) {
      if (error.code === '23505') throw new ApiError(409, 'STUDENT_CONFLICT', 'Student number or RFID card is already assigned.');
      throw error;
    }
  }
  return { list, read, save };
}
module.exports = { createStudentService };
