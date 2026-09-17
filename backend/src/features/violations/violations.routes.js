const express = require('express');
const { createViolationsService } = require('./violations.service');

function violationsRoutes(db, auth) {
  const router = express.Router();
  const service = createViolationsService(db);
  router.use(auth.requireAuth, auth.allow('ADMIN','GUARD','DISCIPLINE'));
  router.get('/', async (req, res) => res.json({ success: true, message: 'Violations retrieved.', data: await service.list() }));
  router.post('/', auth.allow('ADMIN','GUARD'), async (req, res) => {
    const data = await service.report(req.body, req.auth.user.id);
    res.status(data.duplicate ? 200 : 201).json({ success: true, message: 'Violation recorded.', data });
  });
  router.patch('/:id/clear', auth.allow('ADMIN','DISCIPLINE'), async (req, res) => {
    await service.clear(req.params.id, req.auth.user.id);
    res.json({ success: true, message: 'Violation cleared.', data: null });
  });
  return router;
}
module.exports = { violationsRoutes };
