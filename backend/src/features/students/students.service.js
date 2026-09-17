const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const { studentView } = require('./students.validation');
function createStudentService(db) {
  async function list() { return (await db.query('SELECT s.*,EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) AS has_photo FROM students s ORDER BY full_name LIMIT 1000')).rows.map(studentView); }
  async function save(input, actorId, existingId) {
    const id = existingId || randomUUID();
    try {
      return await db.transaction(async (client) => {
        const values = [id, input.studentNo, input.name, input.uid || null, input.course, input.year, input.section, input.active];
        const sql = existingId ? 'UPDATE students SET student_no=$2,full_name=$3,rfid_uid=$4,course=$5,year_level=$6,section=$7,active=$8,updated_at=now() WHERE id=$1 RETURNING *' : 'INSERT INTO students(id,student_no,full_name,rfid_uid,course,year_level,section,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *';
        const { rows } = await client.query(sql, values);
        if (!rows[0]) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
        await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'students', id, rows[0]]);
        await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, existingId ? 'STUDENT_UPDATED' : 'STUDENT_CREATED', id]);
        return studentView(rows[0]);
      });
    } catch (error) {
      if (error.code === '23505') throw new ApiError(409, 'STUDENT_CONFLICT', 'Student number or RFID card is already assigned.');
      throw error;
    }
  }
  return { list, save };
}
module.exports = { createStudentService };
