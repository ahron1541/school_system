const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function createViolationsService(db) {
  async function list() {
    return (await db.query(`SELECT v.id,v.student_id AS "studentId",s.full_name AS name,s.student_no AS "studentNo",
      v.description,v.status,v.created_at AS "createdAt",v.cleared_at AS "clearedAt",u.full_name AS "reportedBy"
      FROM violations v JOIN students s ON s.id=v.student_id JOIN users u ON u.id=v.reported_by
      ORDER BY v.created_at DESC LIMIT 1000`)).rows;
  }
  async function report(body, actorId) {
    const { studentId, description, requestId } = body || {};
    if (typeof studentId !== 'string' || !uuid.test(studentId) || typeof description !== 'string' || description.trim().length < 3 || description.trim().length > 1000 || (requestId !== undefined && (typeof requestId !== 'string' || !uuid.test(requestId)))) throw new ApiError(422, 'INVALID_VIOLATION', 'Select a student and enter a description (3-1000 characters).');
    return db.transaction(async (client) => {
      if (requestId) {
        await client.query('SELECT pg_advisory_xact_lock(3,hashtext($1))', [actorId + ':' + requestId]);
        const prior = (await client.query('SELECT * FROM violations WHERE reported_by=$1 AND request_id=$2', [actorId, requestId])).rows[0];
        if (prior) {
          if (prior.student_id !== studentId || prior.description !== description.trim()) throw new ApiError(409, 'REPORT_CONFLICT', 'This submission was already used for a different report.');
          return { id: prior.id, duplicate: true };
        }
      }
      if (!(await client.query('SELECT 1 FROM students WHERE id=$1', [studentId])).rowCount) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
      const id = randomUUID();
      const { rows } = await client.query('INSERT INTO violations(id,student_id,reported_by,description,request_id) VALUES($1,$2,$3,$4,$5) RETURNING *', [id, studentId, actorId, description.trim(), requestId || null]);
      await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'violations', id, rows[0]]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, 'VIOLATION_REPORTED', id]);
      return { id, duplicate: false };
    });
  }
  async function clear(id, actorId) {
    if (!uuid.test(id)) throw new ApiError(422, 'INVALID_ID', 'Invalid violation ID.');
    await db.transaction(async (client) => {
      const { rows } = await client.query("UPDATE violations SET status='CLEARED',cleared_by=$2,cleared_at=now() WHERE id=$1 AND status='ACTIVE' RETURNING *", [id, actorId]);
      if (!rows[0]) throw new ApiError(409, 'VIOLATION_UNAVAILABLE', 'Violation not found or already cleared.');
      await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'violations', id, rows[0]]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, 'VIOLATION_CLEARED', id]);
    });
  }
  return { list, report, clear };
}
module.exports = { createViolationsService };
