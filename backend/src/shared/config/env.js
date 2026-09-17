function readEnv(source = process.env) {
  const port = Number(source.PORT || 4000);
  const host = source.HOST || '127.0.0.1';
  const deviceId = source.DEVICE_ID || 'gate-01';
  const deviceKey = source.DEVICE_API_KEY || '';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('HOST must be 127.0.0.1 or 0.0.0.0.');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(deviceId)) throw new Error('DEVICE_ID must contain 1-40 letters, digits, underscores or hyphens.');
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(deviceKey) || deviceKey.startsWith('replace_')) {
    throw new Error('Configure DEVICE_API_KEY with a random 32-128 character key; run npm run setup for initial setup.');
  }
  return { port, host, deviceId, deviceKey, databaseUrl: source.DATABASE_URL || '', secureCookies: source.COOKIE_SECURE === 'true', appOrigins: (source.APP_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000').split(',').map((value) => value.trim()) };
}

module.exports = { readEnv };
