const express = require('express');
const { validateScan } = require('../devices/device.validation');
const { createEntryService } = require('./entry.service');

function entryRoutes(db, config, devices, auth, gate) {
  const router = express.Router();
  const service = createEntryService(db, config, devices);
  router.post('/scan', async (req, res) => {
    const data = gate ? await gate.scan(require('../gate/device-security').validateGateScan(req.body)) : await service.scan(validateScan(req.body));
    res.status(data.duplicate ? 200 : 201).json({ success: true, message: data.message, data });
  });
  router.get('/', auth.requireAuth, auth.allow('ADMIN','GUARD'), async (req, res) => res.json({ success: true, message: 'Gate activity retrieved.', data: await service.list(req.query.date || '') }));
  return router;
}
module.exports = { entryRoutes };
