// =============================================================================
// Idle Session Watchdog
// =============================================================================
// Signs the user out after IDLE_MINUTES with no interaction.
//
// WHY THE CLIENT NEEDS THIS AT ALL — isn't the server enough?
// The server already enforces the same window: the refresh token expires after
// 15 minutes and is rotated on every /auth/refresh, so a session that makes no
// requests dies on its own. But "dies" there only becomes VISIBLE on the next
// API call. A tab left open on a dashboard would keep showing a logged-in UI
// for hours, then fail the moment the user clicked something. This watchdog
// closes that gap: the tab signs itself out on time. The server stays the
// authority — tampering with this file buys nothing, the tokens still expire.
//
// WHAT COUNTS AS ACTIVITY:
// Real user input only (pointer, keyboard, scroll, touch). Deliberately NOT
// background chatter — socket messages, polling and timers must not keep a
// session alive while the user is away from the machine.
//
// WHY localStorage FOR THE TIMESTAMP:
//   1. Cross-tab: working in one tab keeps the others alive, so we don't sign
//      someone out of a background tab while they're actively using the app.
//   2. Survives reload: a hard refresh doesn't hand out a fresh 15 minutes.
// It holds a timestamp, not a token — nothing secret lives here.
//
// WHY WALL-CLOCK COMPARISON INSTEAD OF setTimeout(15 min):
// Timers don't fire (or fire late) while a laptop is asleep or a tab is
// throttled in the background. Comparing Date.now() against the stored stamp
// gives the right answer no matter what the browser did with our timers.
// =============================================================================

// Keep in sync with the server's SESSION_IDLE_MINUTES (server/src/config).
export const IDLE_MINUTES = 15;
export const IDLE_TIMEOUT_MS = IDLE_MINUTES * 60 * 1000;

// How often we compare the clock against the last-activity stamp. Short enough
// that the sign-out lands close to the 15-minute mark, cheap enough to ignore.
const CHECK_INTERVAL_MS = 15 * 1000;

// Don't hammer localStorage on every mousemove — one write per 5s is plenty
// when the thing we're measuring is a 15-minute gap.
const WRITE_THROTTLE_MS = 5 * 1000;

const LAST_ACTIVITY_KEY = 'cb_last_activity';

// Why the user was signed out, read once by the login page to explain itself.
const LOGOUT_REASON_KEY = 'cb_logout_reason';
export type LogoutReason = 'idle';

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
  'pointerdown',
] as const;

let lastWrite = 0;

export function markActivity(force = false): void {
  const now = Date.now();
  if (!force && now - lastWrite < WRITE_THROTTLE_MS) return;
  lastWrite = now;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    /* storage unavailable (private mode / disabled) — see isIdle() */
  }
}

// Milliseconds since the last recorded interaction, or null when we have no
// stamp at all (first visit, or storage is unavailable).
function msSinceActivity(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const at = Number(raw);
    if (!Number.isFinite(at)) return null;
    return Date.now() - at;
  } catch {
    return null;
  }
}

// A missing stamp is NOT treated as idle: with localStorage unavailable we'd
// otherwise sign the user out instantly on every page. In that case the server's
// token expiry is the only enforcement, which is the correct fallback.
export function isIdle(): boolean {
  const elapsed = msSinceActivity();
  return elapsed !== null && elapsed >= IDLE_TIMEOUT_MS;
}

export function clearActivity(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* nothing to clear */
  }
}

// --- Logout reason, handed from wherever the session ends to the login page ---

export function setLogoutReason(reason: LogoutReason): void {
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
  } catch {
    /* the login page just won't show the explanation */
  }
}

// Single-use: reading it clears it, so the notice shows once and doesn't
// reappear when the user navigates back to /login later.
export function takeLogoutReason(): LogoutReason | null {
  try {
    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) sessionStorage.removeItem(LOGOUT_REASON_KEY);
    return reason === 'idle' ? 'idle' : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// watchIdle — start tracking. Returns a cleanup function.
// ---------------------------------------------------------------------------
// `onIdle` fires at most once per watch; the caller is expected to tear the
// session down, which unmounts the watcher.
export function watchIdle(onIdle: () => void): () => void {
  let fired = false;

  function check() {
    if (fired || !isIdle()) return;
    fired = true;
    onIdle();
  }

  const handleActivity = () => markActivity();

  ACTIVITY_EVENTS.forEach((event) =>
    window.addEventListener(event, handleActivity, { passive: true }),
  );

  // Coming back to a backgrounded tab: check immediately rather than waiting
  // out the poll interval, so a long-idle tab doesn't flash its logged-in UI.
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  const timer = window.setInterval(check, CHECK_INTERVAL_MS);

  return () => {
    ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
    document.removeEventListener('visibilitychange', handleVisibility);
    window.clearInterval(timer);
  };
}
