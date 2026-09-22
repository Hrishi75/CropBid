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
import { clearPlaintextRefreshTokens } from './utils/refreshToken';
import { warmRates } from './services/rates.service';

const PORT = config.port;

// Create HTTP server with Express as the request handler
const server = http.createServer(app);

// Attach Socket.io to the HTTP server
// WHY HERE AND NOT IN app.ts?
// Socket.io needs the raw HTTP server, not the Express app.
// app.ts exports the Express app (for middleware/routes).
// index.ts creates the HTTP server and attaches both Express and Socket.io to it.
initializeSocket(server);

// Refresh tokens are stored hashed (utils/refreshToken). A deploy applies
// migrations before swapping the API, so the old code can write a raw token
// into the column the migration cleared; this runs after the swap and clears
// whatever landed in that window. It matches nothing on an ordinary boot.
//
// Not awaited, and never fatal: the server must come up either way, and a
// leftover token is refused by the comparison regardless.
void clearPlaintextRefreshTokens()
  .then((cleared) => {
    if (cleared > 0) console.log(`🔑 Cleared ${cleared} refresh token(s) that were stored in the clear`);
  })
  .catch((err) => console.error('Could not sweep plaintext refresh tokens:', err));

// Start downloading the day's mandi feed and reading the usual prices now,
// so the first visitor to the rates board is not the one who waits. Never fatal.
warmRates();

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
