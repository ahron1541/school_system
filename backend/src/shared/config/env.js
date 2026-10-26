function readEnv(source = process.env) {
  const port = Number(source.PORT || 4000);
  const host = source.HOST || '127.0.0.1';
  const deviceId = source.DEVICE_ID || 'gate-01';
  const deviceKey = source.DEVICE_API_KEY || '';
  const adminScannerKey = source.ADMIN_SCANNER_API_KEY || '';
  const schoolSessionStart=source.SCHOOL_SESSION_START||'07:00',schoolSessionEnd=source.SCHOOL_SESSION_END||'20:00';
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(schoolSessionStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schoolSessionEnd) || schoolSessionStart>=schoolSessionEnd) throw new Error('School hours must be HH:MM, with start before end on the same day.');
  const gateDuplicateSeconds=Number(source.GATE_DUPLICATE_SECONDS||5);
  if(!Number.isInteger(gateDuplicateSeconds)||gateDuplicateSeconds<1||gateDuplicateSeconds>30) throw new Error('GATE_DUPLICATE_SECONDS must be 1-30.');
  if (source.SERVE_FRONTEND !== undefined && !['true', 'false'].includes(source.SERVE_FRONTEND)) throw new Error('SERVE_FRONTEND must be true or false.');
  if (adminScannerKey && !/^[a-f0-9]{64}$/.test(adminScannerKey)) throw new Error('ADMIN_SCANNER_API_KEY must be 64 lowercase hexadecimal characters.');
  const deviceRateLimit = Number(source.DEVICE_RATE_LIMIT_PER_MINUTE || 240);
  if (!Number.isInteger(deviceRateLimit) || deviceRateLimit < 1 || deviceRateLimit > 10000) throw new Error('DEVICE_RATE_LIMIT_PER_MINUTE must be an integer between 1 and 10000.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('HOST must be 127.0.0.1 or 0.0.0.0.');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(deviceId)) throw new Error('DEVICE_ID must contain 1-40 letters, digits, underscores or hyphens.');
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(deviceKey) || deviceKey.startsWith('replace_')) {
    throw new Error('Configure DEVICE_API_KEY with a random 32-128 character key; run npm run setup for initial setup.');
  }
  return { gateEnabled:true,gateLogEvents:true,schoolSessionStart,schoolSessionEnd,gateDuplicateSeconds,port, host, deviceId, deviceKey, adminScannerKey, deviceRateLimit, serveFrontend: source.SERVE_FRONTEND === 'true', databaseUrl: source.DATABASE_URL || '', secureCookies: source.COOKIE_SECURE === 'true', appOrigins: (source.APP_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000').split(',').map((value) => value.trim()) };
}

module.exports = { readEnv };
