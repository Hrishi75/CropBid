// =============================================================================
// Socket.io client — singleton WebSocket for the native app
// =============================================================================
// Mirrors the web client (client/src/lib/socket.ts). The server authenticates
// the handshake via the `auth` object (not an HTTP header), so we pass the
// access token there. Using the function form re-reads the token on every
// (re)connect, so a rotated token keeps reconnections authenticated.
//
// The socket connects to the API ORIGIN (no /api suffix) — same as MEDIA_BASE.
// On connect the server auto-joins `user:<userId>` and pushes 'notification:new'.
// =============================================================================

import { io, type Socket } from 'socket.io-client';
import { getAccessToken, MEDIA_BASE } from '../api/client';

let socket: Socket | null = null;

export function getSocket(userName?: string): Socket {
  if (!socket) {
    socket = io(MEDIA_BASE, {
      // React Native has no XHR-polling parity with the browser; force websocket.
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() ?? '', userName: userName || 'Anonymous' }),
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
