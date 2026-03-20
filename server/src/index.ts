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
import { initializeSocket } from './socket';

const PORT = config.port;

// Create HTTP server with Express as the request handler
const server = http.createServer(app);

// Attach Socket.io to the HTTP server
// WHY HERE AND NOT IN app.ts?
// Socket.io needs the raw HTTP server, not the Express app.
// app.ts exports the Express app (for middleware/routes).
// index.ts creates the HTTP server and attaches both Express and Socket.io to it.
initializeSocket(server);

server.listen(PORT, () => {
  console.log(`
  🌾 CropBid Server is running!

  → Local:        http://localhost:${PORT}
  → Health check: http://localhost:${PORT}/api/health
  → WebSocket:    ws://localhost:${PORT}/socket.io
  → Environment:  ${config.nodeEnv}
  `);
});

export { server };
