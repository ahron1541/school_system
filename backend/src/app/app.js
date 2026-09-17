const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createDatabase } = require('../database/client');
const { createAuth } = require('../features/auth/auth.routes');
const { studentsRoutes } = require('../features/students/students.routes');
const { entryRoutes } = require('../features/entry-logs/entry.routes');
const { violationsRoutes } = require('../features/violations/violations.routes');
const { deviceRoutes } = require('../features/devices/device.routes');
const { createDeviceService } = require('../features/devices/device.service');
const { ApiError, errorHandler } = require('../shared/middleware/error-handler');
const { systemRoutes } = require('../features/system/system.routes');
const { guardRoutes } = require('../features/guard/guard.routes');

function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && !req.is('application/json')) {
      throw new ApiError(415, 'JSON_REQUIRED', 'Use Content-Type: application/json.');
    }
    next();
  });
  app.use('/api/devices', express.json({ limit: '2kb', inflate: false }));
  app.use(express.json({ limit: '16kb', inflate: false }));
  const db = options.db || createDatabase(config.databaseUrl);
  app.locals.db = db;
  const auth = createAuth(db, { appOrigins: ['http://127.0.0.1:5173'], secureCookies: false, ...config });
  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running.', data: { stage: 'local-persistent' } });
  });
  const devices = createDeviceService({ ...config, ...options });
  app.use('/api/devices', deviceRoutes(config, devices));
  app.use('/api/auth', auth.router);
  app.use('/api/students', studentsRoutes(db, auth));
  app.use('/api/entry-logs', entryRoutes(db, config, devices, auth));
  app.use('/api/violations', violationsRoutes(db, auth));
  app.use('/api/system', systemRoutes(config, devices, auth, db));
  app.use('/api/guard', guardRoutes(db, config, devices, auth));
  app.use((req, res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found.')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
