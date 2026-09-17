const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const { studentView } = require('../students/students.validation');

function createEntryService(db, config, devices) {
  async function scan(input) {
    if (input.deviceId !== config.deviceId) throw new ApiError(403, 'DEVICE_NOT_ALLOWED', 'Device is not configured.');
    const result = await db.transaction(async (client) => {
      // Serialize requests for one card, including retries arriving together.
      await client.query('SELECT pg_advisory_xact_lock(1,hashtext($1))', [input.uid]);
      await client.query('SELECT pg_advisory_xact_lock(2,hashtext($1))', [input.deviceId + ':' + input.eventId]);
      const prior = await client.query('SELECT uid,result FROM scan_events WHERE device_id=$1 AND event_id=$2', [input.deviceId, input.eventId]);
      if (prior.rowCount) {
        if (prior.rows[0].uid !== input.uid) throw new ApiError(409, 'EVENT_CONFLICT', 'Event ID already used for another card.');
        return { ...prior.rows[0].result, duplicate: true };
      }
      const { rows: students } = await client.query('SELECT * FROM students WHERE rfid_uid=$1 FOR UPDATE', [input.uid]);
      const student = students[0];
      const now = new Date();
      let response = { status: 'unknown', message: 'Card not registered.', receivedAt: now.toISOString(), duplicate: false };
      let direction;
      if (student) {
        if (!student.active) response = { ...response, status: 'blocked', message: 'Student enrollment is inactive.' };
        else {
          const last = await client.query('SELECT direction,scanned_at FROM entry_logs WHERE student_id=$1 ORDER BY scanned_at DESC LIMIT 1', [student.id]);
          if (last.rowCount && now - new Date(last.rows[0].scanned_at) < 10000) response = { ...response, status: 'ignored', message: 'Card already scanned. Please wait before tapping again.' };
          else {
            const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
            direction = last.rowCount && day(new Date(last.rows[0].scanned_at)) === day(now) && last.rows[0].direction === 'IN' ? 'OUT' : 'IN';
            const alerts = await client.query("SELECT 1 FROM violations WHERE student_id=$1 AND status='ACTIVE' LIMIT 1", [student.id]);
            response = { ...response, status: alerts.rowCount ? 'alert' : 'ok', message: direction === 'IN' ? 'Entry recorded.' : 'Exit recorded.', studentName: student.full_name, studentNo: student.student_no, type: direction };
          }
        }
      }
      const scanId = randomUUID();
      await client.query('INSERT INTO scan_events(id,device_id,event_id,uid,result,received_at,student_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [scanId, input.deviceId, input.eventId, input.uid, response, now, student?.id || null]);
      if (direction) {
        const id = randomUUID();
        const { rows } = await client.query('INSERT INTO entry_logs(id,student_id,scan_id,device_id,direction,scanned_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [id, student.id, scanId, input.deviceId, direction, now]);
        await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'entry_logs', id, rows[0]]);
      }
      return response;
    });
    devices.heartbeat(input.deviceId);
    return result;
  }
  async function list(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new ApiError(422, 'INVALID_DATE', 'Choose a valid date.');
    const { rows } = await db.query("SELECT e.id AS log_id,e.direction,e.device_id,e.scanned_at,s.*,EXISTS(SELECT 1 FROM violations v WHERE v.student_id=s.id AND v.status='ACTIVE') AS alert FROM entry_logs e JOIN students s ON s.id=e.student_id WHERE e.scanned_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Manila') AND e.scanned_at < (($1::date+1)::timestamp AT TIME ZONE 'Asia/Manila') ORDER BY e.scanned_at DESC LIMIT 1000", [date]);
    return rows.map((row) => ({ id: row.log_id, person: studentView(row), direction: row.direction, alert: row.alert, gate: row.device_id, scannedAt: row.scanned_at, time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(row.scanned_at)) }));
  }
  return { scan, list };
}
module.exports = { createEntryService };
