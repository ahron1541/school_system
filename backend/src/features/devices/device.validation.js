const { ApiError } = require('../../shared/middleware/error-handler');

function validateScan(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['uid', 'deviceId', 'eventId'].includes(key)) ||
      typeof body.uid !== 'string' || !/^(?:[a-fA-F0-9]{8}|[a-fA-F0-9]{14}|[a-fA-F0-9]{20})$/.test(body.uid) ||
      typeof body.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(body.deviceId) ||
      typeof body.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.eventId)) {
    throw new ApiError(422, 'INVALID_SCAN', 'Provide uid (8, 14 or 20 hex characters), deviceId and eventId; no extra fields.');
  }
  return { uid: body.uid.toUpperCase(), deviceId: body.deviceId, eventId: body.eventId };
}

module.exports = { validateScan };
