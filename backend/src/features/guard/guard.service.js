const { studentView } = require('../students/students.validation');

function createGuardService(db, config, devices) {
  async function latest(publicDisplay = false) {
    const { rows } = await db.query(`SELECT se.id AS scan_id,se.result,se.received_at,s.*,
      EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) AS has_photo
      FROM scan_events se LEFT JOIN students s ON s.id=se.student_id
      WHERE se.device_id=$1 ORDER BY se.received_at DESC,se.id DESC LIMIT 1`, [config.deviceId]);
    const row = rows[0];
    const now = Date.now();
    let scan = null;
    if (row && now - new Date(row.received_at).getTime() < 12000) {
      const person = row.id ? studentView(row) : null;
      scan = {
        id: row.scan_id, status: row.result.status, message: row.result.message,
        direction: row.result.type || null, receivedAt: row.received_at,
        expiresAt: new Date(new Date(row.received_at).getTime() + 12000).toISOString(),
        person,
      };
      if (publicDisplay) {
        scan.status = scan.status === 'alert' ? 'ok' : scan.status;
        if (scan.status === 'blocked') scan.message = 'Please see the guard.';
        scan.person = person ? { name: person.name, photo: person.photo } : null;
      }
    }
    const device = devices.status();
    return { scan, serverTime: new Date(now).toISOString(), device: { deviceId: device.deviceId, connection: device.connection, lastSeenAt: device.lastSeenAt } };
  }
  async function dashboard() {
    const live = await latest();
    const { rows } = await db.query(`SELECT
      (SELECT count(*)::int FROM entry_logs WHERE direction='IN' AND scanned_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS entries,
      (SELECT count(*)::int FROM entry_logs WHERE direction='OUT' AND scanned_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila') AS exits,
      (SELECT count(*)::int FROM violations WHERE status='ACTIVE') AS alerts`);
    const recent = await db.query(`SELECT se.id,se.received_at AS "receivedAt",se.result->>'status' AS status,
      se.result->>'type' AS direction,s.id AS "studentId",s.full_name AS name,s.student_no AS "studentNo"
      FROM scan_events se LEFT JOIN students s ON s.id=se.student_id WHERE se.device_id=$1
      ORDER BY se.received_at DESC,se.id DESC LIMIT 10`, [config.deviceId]);
    return { ...live, totals: rows[0], recent: recent.rows, database: 'connected' };
  }
  return { latest, dashboard };
}
module.exports = { createGuardService };
