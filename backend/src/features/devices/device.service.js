const { ApiError } = require('../../shared/middleware/error-handler');

function createDeviceService({ deviceId, now = Date.now, log = console.log }) {
  const events = new Map();
  let lastSeen = null;
  let latestScan = null;
  const retentionMs = 5 * 60 * 1000;

  function assertDevice(id) {
    if (id !== deviceId) throw new ApiError(403, 'DEVICE_NOT_ALLOWED', 'Device is not configured for this server.');
  }

  function heartbeat(id) {
    assertDevice(id);
    lastSeen = now();
    return status();
  }

  function status() {
    return {
      deviceId,
      connection: lastSeen === null ? 'never_seen' : now() - lastSeen < 15000 ? 'online' : 'offline',
      lastSeenAt: lastSeen === null ? null : new Date(lastSeen).toISOString(),
      latestScan,
    };
  }

  function receive(scan) {
    assertDevice(scan.deviceId);
    const time = now();
    for (const [id, entry] of events) {
      if (time - entry.time >= retentionMs) events.delete(id);
    }
    const previous = events.get(scan.eventId);
    if (previous && previous.scan.uid !== scan.uid) {
      throw new ApiError(409, 'EVENT_CONFLICT', 'This eventId has already been used for a different UID.');
    }
    if (previous) {
      lastSeen = time;
      return { ...previous.scan, duplicate: true };
    }
    if (events.size >= 1000) throw new ApiError(503, 'PROTOTYPE_CAPACITY', 'Prototype buffer is full. Retry later.');
    lastSeen = time;
    latestScan = { ...scan, receivedAt: new Date(time).toISOString() };
    events.set(scan.eventId, { time, scan: latestScan });
    log(`[DEVICE] Test scan received from ${deviceId}; UID ending ${scan.uid.slice(-4)}`);
    return { ...latestScan, duplicate: false };
  }

  return { heartbeat, status, receive };
}

module.exports = { createDeviceService };
