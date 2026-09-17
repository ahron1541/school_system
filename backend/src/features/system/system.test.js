const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { probeDatabase } = require('./system.service');
test('PostgreSQL status detects invalid settings and bounds a stalled handshake', async (t) => {
  assert.equal((await probeDatabase('')).state, 'not_configured');
  assert.equal((await probeDatabase('mysql://localhost/db')).state, 'invalid_configuration');
  const sockets = new Set();
  const server = createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const started = Date.now();
  const result = await probeDatabase('postgresql://test@127.0.0.1:' + server.address().port + '/test');
  assert.equal(result.state, 'disconnected');
  assert.ok(Date.now() - started < 4000);
});
