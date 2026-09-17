const { createApp } = require('./app/app');
const { readEnv } = require('./shared/config/env');

try {
  const config = readEnv();
  const app = createApp(config);
  const server = app.listen(config.port, config.host, () => {
    console.log(`[SERVER] Listening on http://${config.host}:${config.port}`);
    console.log('[SERVER] Staff access requires sign-in. Records are stored in local PostgreSQL.');
  });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? '[SERVER] Port in use. Choose another PORT in .env.' : '[SERVER] Could not start server. Check HOST and PORT.');
    process.exitCode = 1;
  });
  function shutdown() {
    server.close(async () => { await app.locals.db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`[CONFIG] ${error.message}`);
  process.exitCode = 1;
}
