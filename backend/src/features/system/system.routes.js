const express = require('express');
const { createSystemService } = require('./system.service');

function systemRoutes(config, devices, auth, db) {
  const router = express.Router();
  const service = createSystemService(config, devices, undefined, db);
  router.use(auth.requireAuth, auth.allow('ADMIN'));
  router.get('/status', async (req, res) => {
    res.json({ success: true, message: 'System status checked.', data: await service.status() });
  });
  return router;
}

module.exports = { systemRoutes };
