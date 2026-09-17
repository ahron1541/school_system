const express = require('express');
const { createGuardService } = require('./guard.service');

function guardRoutes(db, config, devices, auth) {
  const router = express.Router();
  const service = createGuardService(db, config, devices);
  router.use(auth.requireAuth, auth.allow('ADMIN', 'GUARD'));
  router.get('/dashboard', async (req, res) => res.json({ success: true, message: 'Guard post status.', data: await service.dashboard() }));
  router.get('/display', async (req, res) => res.json({ success: true, message: 'Scan display status.', data: await service.latest(true) }));
  return router;
}
module.exports = { guardRoutes };
