// =============================================================================
// Socket.io Client — WebSocket Connection Manager
// =============================================================================
// WHY A SINGLETON?
// We want ONE WebSocket connection per browser tab, not one per component.
// If 3 components import this file, they all share the same socket.
//
// WHY LAZY INITIALIZATION?
// We don't connect on import — we wait until the user is authenticated
// and a component actually needs the socket. This avoids wasted connections
// for users who never visit an auction page.
//
// WHY PASS THE TOKEN?
// The server's Socket.io middleware verifies JWT on connection.
// Unlike HTTP (where we add it as a header), Socket.io uses the
// `auth` object in the handshake options.
// =============================================================================

import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './axios';

let socket: Socket | null = null;

export function getSocket(userName?: string): Socket {
  if (!socket) {
    const token = getAccessToken();

    socket = io('/', {
      // WHY auth object?
      // Socket.io passes this to the server during the initial handshake.
      // The server's middleware extracts the token and verifies it.
      auth: {
        token,
        userName: userName || 'Anonymous',
      },
      // Don't connect automatically — we call connect() manually
      autoConnect: false,
      // Reconnect up to 5 times with exponential backoff
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
