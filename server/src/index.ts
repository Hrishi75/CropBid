// =============================================================================
// Server Entry Point
// =============================================================================
// This file has ONE job: start the HTTP server.
// All app configuration lives in app.ts.
// Later, we'll create the HTTP server manually (http.createServer) to attach
// Socket.io for real-time features like live bidding and notifications.
// =============================================================================

import app from './app';
import { config } from './config';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`
  🌾 CropBid Server is running!

  → Local:        http://localhost:${PORT}
  → Health check: http://localhost:${PORT}/api/health
  → Environment:  ${config.nodeEnv}
  `);
});
