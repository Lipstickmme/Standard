'use strict';

/**
 * Standard Merchant Bank server entry point.
 * Boots the HTTP server and wires graceful shutdown.
 */

const http = require('http');
const app = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  const mode = process.env.NODE_ENV || 'development';
  console.log(`[smb] server listening on http://localhost:${PORT} (${mode})`);
});

// Graceful shutdown so runtime data flushes cleanly.
function shutdown(signal) {
  console.log(`[smb] received ${signal}, shutting down...`);
  server.close(() => {
    console.log('[smb] closed remaining connections. bye.');
    process.exit(0);
  });
  // Force-exit if connections hang.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
