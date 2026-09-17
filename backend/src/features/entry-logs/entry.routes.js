const express = require('express');
const { createHash, timingSafeEqual } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const { validateScan } = require('../devices/device.validation');
const { createEntryService } = require('./entry.service');

function entryRoutes(db, config, devices, auth) {
  const router = express.Router();
  const service = createEntryService(db, config, devices);
  const digest = (value) => createHash('sha256').update(value).digest();
  router.post('/scan', async (req, res) => {
    if (!timingSafeEqual(digest(req.get('X-Device-Key') || ''), digest(config.deviceKey))) throw new ApiError(401, 'INVALID_DEVICE_KEY', 'Valid device credentials are required.');
    const data = await service.scan(validateScan(req.body));
    res.status(data.duplicate ? 200 : 201).json({ success: true, message: data.message, data });
  });
  router.get('/', auth.requireAuth, auth.allow('ADMIN','GUARD','DISCIPLINE'), async (req, res) => res.json({ success: true, message: 'Gate activity retrieved.', data: await service.list(req.query.date || '') }));
  return router;
}
module.exports = { entryRoutes };
