const express = require('express');
const { createDeviceHttp } = require('../devices/device.http');
const { ApiError } = require('../../shared/middleware/error-handler');
const { createAdminScannerService } = require('./admin-scanner.service');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function adminScannerRoutes(db, auth, config) {
  const router = express.Router();
  const service = createAdminScannerService(db);
  const enabled = (req, res, next) => {
    if (!config.adminScannerKey) throw new ApiError(503, 'SCANNER_NOT_CONFIGURED', 'Scanner 1 credentials are not configured. Run the scanner setup first.');
    next();
  };
  const respond = (res, data, status = 200) => res.status(status).json({ success: true, message: 'Scanner request completed.', data });
  // Device authentication and body limits run BEFORE the application's JSON parser.
  router.use('/device', enabled, ...createDeviceHttp({ deviceKey: config.adminScannerKey || '', deviceRateLimit: 120 }));
  router.get('/device/capture', async (req, res) => respond(res, await service.deviceCapture()));
  router.post('/device/scans', async (req, res) => {
    const body = req.body;
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['captureId','uid'].includes(key)) || !uuid.test(body.captureId || '') || typeof body.uid !== 'string' || !/^(?:[a-f0-9]{8}|[a-f0-9]{14}|[a-f0-9]{20})$/i.test(body.uid)) throw new ApiError(422, 'INVALID_SCAN', 'Provide a capture ID and a valid RFID UID.');
    respond(res, await service.receive(body.captureId, body.uid.toUpperCase()));
  });
  router.use(auth.requireAuth, auth.allow('ADMIN','REGISTRAR'), enabled, express.json({ limit: '1kb', inflate: false }));
  router.post('/captures', async (req, res) => {
    const body = req.body;
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => key !== 'studentId') || (body.studentId !== undefined && !uuid.test(body.studentId))) throw new ApiError(422, 'INVALID_CAPTURE', 'Provide a valid student ID or an empty object.');
    respond(res, await service.start(req.sessionHash, body.studentId || null), 201);
  });
  router.get('/captures/:id', (req, res) => respond(res, service.read(req.params.id, req.sessionHash)));
  router.delete('/captures/:id', (req, res) => { service.cancel(req.params.id, req.sessionHash); respond(res, null); });
  return router;
}
module.exports = { adminScannerRoutes };
