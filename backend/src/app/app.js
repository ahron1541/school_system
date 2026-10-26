const express = require('express');
const path = require('node:path');
const { existsSync } = require('node:fs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createDatabase } = require('../database/client');
const { createAuth } = require('../features/auth/auth.routes');
const { studentsRoutes } = require('../features/students/students.routes');
const { entryRoutes } = require('../features/entry-logs/entry.routes');
const { violationsRoutes } = require('../features/violations/violations.routes');
const { deviceRoutes } = require('../features/devices/device.routes');
const { createDeviceService } = require('../features/devices/device.service');
const { createDeviceHttp } = require('../features/devices/device.http');
const { ApiError, errorHandler } = require('../shared/middleware/error-handler');
const { systemRoutes } = require('../features/system/system.routes');
const { guardRoutes } = require('../features/guard/guard.routes');
const { usersRoutes } = require('../features/users/users.routes');
const { adminScannerRoutes } = require('../features/admin-scanner/admin-scanner.routes');
const {createGateService}=require('../features/gate/gate.service');
const {gateDeviceRoutes,gateStaffRoutes}=require('../features/gate/gate.routes');
const {gateDeviceHttp}=require('../features/gate/device-security');
const {semesterRoutes}=require('../features/gate/semesters');

function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    // A closed-LAN HTTP deployment must not upgrade local assets to HTTPS.
    upgradeInsecureRequests: config.secureCookies ? [] : null,
  } } }));
  app.use(cookieParser());
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const db = options.db || createDatabase(config.databaseUrl);
  app.locals.db = db;
  const auth = createAuth(db, { appOrigins: ['http://127.0.0.1:5173'], secureCookies: false, ...config });
  app.use('/api/admin-scanner', adminScannerRoutes(db, auth, config));
  const deviceHttp = createDeviceHttp(config);
  const devices = createDeviceService({ ...config, ...options });
  const gate=config.gateEnabled?createGateService(db,config,devices,options):null;
  app.locals.gate=gate;
  if(gate) app.use('/api/gate',gateDeviceRoutes(config,gate));
  app.use('/api/devices', deviceHttp);
  app.use('/api/entry-logs/scan', gate ? gateDeviceHttp(config) : deviceHttp);
  app.use((req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
      throw new ApiError(415, 'JSON_REQUIRED', 'Use Content-Type: application/json.');
    }
    next();
  });
  app.use('/api/students', express.json({ limit: '64kb', inflate: false }));
  app.use(express.json({ limit: '16kb', inflate: false }));
  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running.', data: { stage: 'local-persistent' } });
  });
  app.use('/api/devices', deviceRoutes(config, devices));
  app.use('/api/auth', auth.router);
  app.use('/api/users', usersRoutes(db, auth));
  app.use('/api/students', studentsRoutes(db, auth));
  app.use('/api/entry-logs', entryRoutes(db, config, devices, auth,gate));
  app.use('/api/semesters',semesterRoutes(db,auth));
  if(gate) app.use('/api/gate',gateStaffRoutes(db,config,gate,auth));
  app.use('/api/violations', violationsRoutes(db, auth));
  app.use('/api/system', systemRoutes(config, devices, auth, db));
  app.use('/api/guard', guardRoutes(db, config, devices, auth));
  if (config.serveFrontend) {
    const directory = options.frontendDirectory || path.resolve(__dirname, '../../../frontend/dist');
    if (!existsSync(path.join(directory, 'index.html'))) throw new Error('Frontend build is missing. Run npm run build in the frontend folder first.');
    // Missing API routes must remain JSON errors, never HTML responses.
    app.use('/api', (req, res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found.')));
    app.use(express.static(directory, { dotfiles: 'deny', redirect: false, setHeaders(res,file) {
      res.setHeader('Cache-Control', /[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpg|webp|svg)$/.test(file)
        ? 'public, max-age=31536000, immutable' : file.endsWith('.html') ? 'no-store' : 'no-cache');
    } }));
  }
  app.use((req, res, next) => next(new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found.')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
