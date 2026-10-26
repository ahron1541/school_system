const { studentView } = require('../students/students.validation');
const {gateHealth}=require('../gate/health');

function createGuardService(db, config, devices) {
  const scanOrder=config.gateEnabled?'se.sequence DESC':'se.received_at DESC,se.id DESC';
  async function latest(publicDisplay = false) {
    const { rows } = await db.query(`SELECT se.id AS scan_id,se.result,se.received_at,s.*,
      EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) AS has_photo,
      EXISTS(SELECT 1 FROM violations v WHERE v.student_id=s.id AND v.status='ACTIVE') AS has_violation,
      (SELECT p.data->>'givenName' FROM student_profiles p WHERE p.student_id=s.id) AS given_name
      FROM scan_events se LEFT JOIN students s ON s.id=se.student_id
      WHERE se.device_id=$1 ORDER BY ${scanOrder} LIMIT 1`, [config.deviceId]);
    const row = rows[0];
    const now = Date.now();
    let scan = null;
    if (row && now - new Date(row.received_at).getTime() < 12000) {
      const person = row.id ? studentView(row) : null;
      scan = {
        id: row.scan_id, status: row.result.status, message: row.result.message,
        direction: row.result.type || null, result:row.result.result,notices:row.result.notices||[],receivedAt: row.received_at,
        expiresAt: new Date(new Date(row.received_at).getTime() + 12000).toISOString(),
        person,
      };
      if (publicDisplay) {
        // Public monitor receives an allowlist, never the private scan decision or notices.
        scan = {
          id:scan.id, expiresAt:scan.expiresAt,
          indicator:row.has_violation?'red':person?.active&&scan.status==='ok'?'green':'amber',
          person:person?{name:row.given_name?.trim()||person.name.trim().split(/\s+/)[0],photo:person.photo,course:person.course,active:person.active}:null,
        };
      }
    }
    const device = config.gateEnabled?await gateHealth(db,config.deviceId,now):devices.status();
    const semesterConfigured=config.gateEnabled?!!(await db.query('SELECT 1 FROM semesters WHERE active')).rowCount:undefined;
    return { scan, semesterConfigured,serverTime: new Date(now).toISOString(), device: { deviceId: device.deviceId, connection: device.connection, lastSeenAt: device.lastSeenAt } };
  }
  async function dashboard() {
    const live = await latest();
    const { rows } = await db.query(`SELECT
      (SELECT count(*)::int FROM entry_logs WHERE direction='IN' AND scanned_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS entries,
      (SELECT count(*)::int FROM entry_logs WHERE direction='OUT' AND scanned_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS exits,
      (SELECT count(*)::int FROM violations WHERE status='ACTIVE') AS alerts`);
    const recent = await db.query(`SELECT se.id,se.received_at AS "receivedAt",se.result->>'status' AS status,
      se.result->>'type' AS direction,se.result->>'message' AS message,se.result->>'result' AS result,s.id AS "studentId",s.full_name AS name,s.student_no AS "studentNo"
      FROM scan_events se LEFT JOIN students s ON s.id=se.student_id WHERE se.device_id=$1
      ORDER BY ${scanOrder} LIMIT 10`, [config.deviceId]);
    const extras=config.gateEnabled?{
      semester:(await db.query('SELECT id,name FROM semesters WHERE active')).rows[0]||null,
      exceptions:(await db.query(`SELECT p.student_id AS id,s.full_name AS name,p.reason,p.version FROM student_presence p JOIN students s ON s.id=p.student_id WHERE p.status='UNKNOWN' ORDER BY p.updated_at DESC LIMIT 100`)).rows
    }:{};
    return { ...live, ...extras,totals: rows[0], recent: recent.rows, database: 'connected' };
  }
  return { latest, dashboard };
}
module.exports = { createGuardService };
