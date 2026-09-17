const express = require('express');
const rateLimit = require('express-rate-limit');
const { timingSafeEqual } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const { createAuthService } = require('./auth.service');

function createAuth(db, config) {
  const service = createAuthService(db);
  const cookieName = 'gate_session';
  const cookie = { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, path: '/' };
  const router = express.Router();
  function originGuard(req, res, next) {
    const origin = req.get('Origin');
    if ((origin && !config.appOrigins.includes(origin)) || req.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    next();
  }
  async function requireAuth(req, res, next) {
    req.auth = await service.session(req.cookies[cookieName]);
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      originGuard(req, res, () => {});
      const actual = Buffer.from(req.get('X-CSRF-Token') || '');
      const expected = Buffer.from(req.auth.csrfToken);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(403, 'INVALID_CSRF', 'Refresh the page and try again.');
    }
    next();
  }
  const allow = (...roles) => (req, res, next) => {
    if (!roles.includes(req.auth.user.role)) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.');
    next();
  };
  router.post('/login', originGuard, rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many sign-in attempts. Try again later.', error: { code: 'LOGIN_RATE_LIMIT' } } }), async (req, res) => {
    const { username, password, remember = false } = req.body || {};
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,50}$/.test(username) || typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password) > 72 || typeof remember !== 'boolean') throw new ApiError(422, 'INVALID_INPUT', 'Enter a valid username and password.');
    const result = await service.login(username, password, remember);
    if (req.cookies[cookieName]) await service.logout(req.cookies[cookieName]);
    res.cookie(cookieName, result.token, { ...cookie, ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}) });
    const { token, ...data } = result;
    res.json({ success: true, message: 'Signed in.', data });
  });
  router.get('/me', requireAuth, (req, res) => res.json({ success: true, message: 'Session active.', data: req.auth }));
  router.post('/logout', requireAuth, async (req, res) => {
    await service.logout(req.cookies[cookieName]);
    res.clearCookie(cookieName, cookie);
    res.json({ success: true, message: 'Signed out.', data: null });
  });
  router.post('/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72 || typeof newPassword !== 'string' || newPassword.length < 12 || Buffer.byteLength(newPassword) > 72) throw new ApiError(422, 'INVALID_PASSWORD', 'Use a new password of at least 12 characters and at most 72 bytes.');
    await service.changePassword(req.auth.user.id, currentPassword, newPassword);
    res.clearCookie(cookieName, cookie);
    res.json({ success: true, message: 'Password changed. Sign in again.', data: null });
  });
  return { router, requireAuth, allow };
}
module.exports = { createAuth };
