// =============================================================================
// Idle session tracking (native)
// =============================================================================
// Mirrors client/src/lib/idle.ts. The server enforces the same window on its
// own — the refresh token expires after 15 minutes and is rotated on every
// /auth/refresh — so an app sitting in the background is already signed out by
// the time the user comes back. This module covers the case the server can't
// see: the app FOREGROUNDED but untouched. Screens that poll (the auction
// screen refetches every 5s) would otherwise keep rotating the refresh token
// forever with the phone face-down on a table.
//
// WHY IN-MEMORY AND NOT SECURE-STORE:
// The timestamp only has to survive as long as the JS context does. If the OS
// kills the app, relaunch does a silent refresh and the server's token expiry
// gives the right answer anyway.
// =============================================================================

// Keep in sync with the server's SESSION_IDLE_MINUTES (server/src/config).
export const IDLE_MINUTES = 15;
export const IDLE_TIMEOUT_MS = IDLE_MINUTES * 60 * 1000;

let lastActivityAt = Date.now();

export function markActivity(): void {
  lastActivityAt = Date.now();
}

export function msSinceActivity(): number {
  return Date.now() - lastActivityAt;
}

export function isIdle(): boolean {
  return msSinceActivity() >= IDLE_TIMEOUT_MS;
}
