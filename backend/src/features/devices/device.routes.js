const express = require('express');
const { createHash, timingSafeEqual } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const { validateScan } = require('./device.validation');

function deviceRoutes(config, service) {
  const router = express.Router();
  const digest = (value) => createHash('sha256').update(value).digest();
  const expectedKey = digest(config.deviceKey);
  router.use((req, res, next) => {
    if (!timingSafeEqual(digest(req.get('X-Device-Key') || ''), expectedKey)) {
      throw new ApiError(401, 'INVALID_DEVICE_KEY', 'Valid device credentials are required.');
    }
    next();
  });
  router.post('/test-scans', (req, res) => {
    const data = service.receive(validateScan(req.body));
    res.status(data.duplicate ? 200 : 201).json({ success: true, message: data.duplicate ? 'Test scan already received.' : 'Test scan received.', data });
  });
  router.put('/:deviceId/heartbeat', (req, res) => {
    res.json({ success: true, message: 'Heartbeat received.', data: service.heartbeat(req.params.deviceId) });
  });
  router.get('/:deviceId/status', (req, res) => {
    if (req.params.deviceId !== config.deviceId) throw new ApiError(404, 'DEVICE_NOT_FOUND', 'Device not found.');
    res.json({ success: true, message: 'Device status retrieved.', data: service.status() });
  });
  return router;
}

module.exports = { deviceRoutes };
