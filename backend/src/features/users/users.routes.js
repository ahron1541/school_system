const express = require('express');
const rateLimit = require('express-rate-limit');
const { createUsersService } = require('./users.service');
const { listInput, createInput, updateInput, actionInput, accountId } = require('./users.validation');

function usersRoutes(db, auth) {
  const router = express.Router();
  const service = createUsersService(db);
  router.use(auth.requireAuth, auth.allow('ADMIN'));
  const sensitive = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, keyGenerator: (req) => req.auth.user.id,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, message: 'Too many account changes. Wait before trying again.', error: { code: 'ACCOUNT_RATE_LIMIT' } } });
  const identity = (req) => ({ id: req.auth.user.id, sessionHash: req.sessionHash });
  router.param('id', (req, res, next, id) => { accountId(id); next(); });
  router.get('/', async (req, res) => res.json({ success: true, message: 'Accounts retrieved.', data: await service.list(listInput(req.query)) }));
  router.post('/', sensitive, async (req, res) => res.status(201).json({ success: true, message: 'Account created. Temporary password expires in 24 hours.', data: await service.create(createInput(req.body), identity(req)) }));
  router.patch('/:id', sensitive, async (req, res) => res.json({ success: true, message: 'Account saved.', data: await service.update(req.params.id, updateInput(req.body), identity(req)) }));
  router.post('/:id/password-reset', sensitive, async (req, res) => res.json({ success: true, message: 'Password reset. All sessions revoked.', data: await service.resetPassword(req.params.id, actionInput(req.body, true), identity(req)) }));
  router.post('/:id/revoke-sessions', sensitive, async (req, res) => res.json({ success: true, message: 'All sessions revoked.', data: await service.revokeSessions(req.params.id, actionInput(req.body), identity(req)) }));
  return router;
}
module.exports = { usersRoutes };
