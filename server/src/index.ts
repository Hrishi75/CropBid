// =============================================================================
// Server Entry Point
// =============================================================================
// WHY http.createServer INSTEAD OF app.listen?
// Express 5's app.listen creates a server internally, but we need direct access
// to the HTTP server object for two reasons:
//   1. Socket.io needs to attach to the raw HTTP server (Phase 10)
//   2. Express 5 route handling works more reliably with createServer
//
// This pattern is standard for any Express app that uses WebSockets.
// =============================================================================

import http from 'http';
import app from './app';
import { config } from './config';

const PORT = config.port;

// Create HTTP server with Express as the request handler
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`
  🌾 CropBid Server is running!

  → Local:        http://localhost:${PORT}
  → Health check: http://localhost:${PORT}/api/health
  → Environment:  ${config.nodeEnv}
  `);
});

// Export server for Socket.io attachment later
export { server };
