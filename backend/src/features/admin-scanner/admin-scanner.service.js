const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');

// One local backend owns Scanner 1. Captures are short-lived, not student records.
function createAdminScannerService(db, now = Date.now) {
  let capture = null;
  const view = (item) => ({ id: item.id, state: item.state, uid: item.uid || '', expiresAt: item.expiresAt });
  function current() {
    if (capture && capture.expiresAt <= now()) capture = null;
    return capture;
  }
  function owned(id, owner) {
    const item = current();
    if (!item || item.id !== id) throw new ApiError(410, 'CAPTURE_EXPIRED', 'Scan request ended. Start a new scan.');
    if (item.owner !== owner) throw new ApiError(403, 'CAPTURE_FORBIDDEN', 'This scan belongs to another session.');
    return item;
  }
  async function start(owner, studentId) {
    if (studentId && !(await db.query('SELECT id FROM students WHERE id=$1', [studentId])).rows.length) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
    if (current()) throw new ApiError(409, 'SCANNER_BUSY', 'Scanner 1 has an active request. Cancel it or wait up to 90 seconds.');
    capture = { id: randomUUID(), owner, studentId, expiresAt: now() + 90000, state: 'waiting', processing: false };
    return view(capture);
  }
  async function authorized(item) {
    const result = await db.query("SELECT s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND NOT u.must_change_password AND u.role IN ('ADMIN','REGISTRAR')", [item.owner]);
    if (!result.rows.length) {
      if (capture === item) capture = null;
      throw new ApiError(410, 'CAPTURE_EXPIRED', 'Scan authorization ended.');
    }
    if (current() !== item) throw new ApiError(410, 'CAPTURE_EXPIRED', 'Scan request ended.');
  }
  async function deviceCapture() {
    const item = current();
    if (!item || item.state !== 'waiting') return null;
    await authorized(item);
    return { id: item.id };
  }
  async function receive(id, uid) {
    const item = current();
    if (!item || item.id !== id) throw new ApiError(410, 'CAPTURE_EXPIRED', 'Scan request ended.');
    if (item.processing) throw new ApiError(409, 'SCAN_BUSY', 'Another scan is being checked.');
    item.processing = true;
    try {
      await authorized(item);
      if (item.state !== 'waiting') {
        if (item.uid === uid) return view(item);
        throw new ApiError(409, 'CAPTURE_COMPLETE', 'This request already received a card.');
      }
      const match = (await db.query('SELECT id FROM students WHERE rfid_uid=$1', [uid])).rows[0];
      if (current() !== item) throw new ApiError(410, 'CAPTURE_EXPIRED', 'Scan request ended.');
      item.uid = uid;
      item.state = match && match.id !== item.studentId ? 'conflict' : 'captured';
      return view(item);
    } finally { item.processing = false; }
  }
  return { start, deviceCapture, receive,
    read: (id, owner) => view(owned(id, owner)),
    cancel: (id, owner) => { owned(id, owner); capture = null; },
  };
}
module.exports = { createAdminScannerService };
