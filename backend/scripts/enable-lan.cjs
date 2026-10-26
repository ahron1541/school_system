// Explicit opt-in; normal startup remains localhost-only.
process.env.HOST = '0.0.0.0';
console.log('[NETWORK] LAN mode enabled. Use only on a trusted private network; do not expose this port to the internet.');
