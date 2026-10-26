const express = require('express');
const rateLimit = require('express-rate-limit');
const { createHash, timingSafeEqual } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');

// Both scan endpoints share one HTTP boundary and one per-IP request budget.
function createDeviceHttp(config) {
  const digest = (value) => createHash('sha256').update(value).digest();
  const expectedKey = digest(config.deviceKey);
  const limiter = rateLimit({
    windowMs: 60000,
    limit: config.deviceRateLimit || 240,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Too many device requests. Retry after the indicated delay.', error: { code: 'DEVICE_RATE_LIMIT' } },
  });
  function authenticate(req, res, next) {
    if (!timingSafeEqual(digest(req.get('X-Device-Key') || ''), expectedKey)) {
      throw new ApiError(401, 'INVALID_DEVICE_KEY', 'Valid device credentials are required.');
    }
    next();
  }
  return [limiter, authenticate, express.json({ limit: '2kb', inflate: false })];
}

module.exports = { createDeviceHttp };
