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

// How long an ACTIVE session may go without talking to /auth/refresh.
//
// WHY THIS EXISTS: marking activity here only moves a number in localStorage.
// The server's idea of the window is the refresh token, and that is rotated
// ONLY by /auth/refresh. Reading a long page or filling a long form is real
// activity that makes no API calls, so without a keepalive the two clocks
// drift apart: this tab believes the user is active while their refresh token
// quietly ages out, and the next request — the form submit — signs them out.
//
// A third of the window means an active user re-arms the server roughly three
// times per idle period, so a single failed keepalive is never fatal.
export const KEEPALIVE_MS = IDLE_TIMEOUT_MS / 3;

const LAST_ACTIVITY_KEY = 'cb_last_activity';

// When we last rotated the refresh token. Shared across tabs for the same
// reason the activity stamp is: the server has ONE session per browser, so a
// refresh done by any tab re-arms it for all of them.
const LAST_SYNC_KEY = 'cb_last_sync';

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

// Returns whether this call actually wrote, so callers can hang further
// per-activity work off the same throttle instead of running it per mousemove.
export function markActivity(force = false): boolean {
  const now = Date.now();
  if (!force && now - lastWrite < WRITE_THROTTLE_MS) return false;
  lastWrite = now;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    /* storage unavailable (private mode / disabled) — see isIdle() */
  }
  return true;
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
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch {
    /* nothing to clear */
  }
}

// --- Keepalive bookkeeping -------------------------------------------------

// Record that the refresh token was just rotated. Called after EVERY successful
// /auth/refresh — the one in the 401 interceptor and the session restore too,
// not just keepalives — so ordinary API traffic postpones the next keepalive
// instead of racing it.
export function markSynced(): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — see needsKeepalive() */
  }
}

// A missing stamp means "no idea when we last synced", which we treat as due.
// Worst case that costs one extra refresh; the opposite default would let the
// drift this whole mechanism exists to prevent go unnoticed.
function needsKeepalive(): boolean {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at >= KEEPALIVE_MS;
  } catch {
    return false; // No storage means no way to coordinate — leave it to the 401 path.
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
//
// `onKeepalive` re-arms the server-side window (see KEEPALIVE_MS). It is driven
// by real input rather than the poll timer, which matters for two reasons:
//
//   1. A background tab receives no pointer or key events, so only the tab the
//      user is actually looking at can fire one. A timer would have every open
//      tab refreshing on its own schedule.
//   2. The server rotates strictly — it rejects any refresh token that isn't
//      the newest one it issued — so two tabs refreshing at once would leave
//      the loser holding a revoked token and force exactly the sign-out this
//      is meant to prevent.
//
// The shared sync stamp is claimed BEFORE the callback runs, so a sibling tab
// that wakes a moment later sees a fresh stamp and stands down.
export function watchIdle(onIdle: () => void, onKeepalive?: () => void): () => void {
  let fired = false;

  function check() {
    if (fired || !isIdle()) return;
    fired = true;
    onIdle();
  }

  const handleActivity = () => {
    // Piggyback on markActivity's throttle — mousemove fires continuously and
    // the keepalive check reads localStorage.
    if (!markActivity()) return;
    // Idle wins over keepalive: once the window has already lapsed, the session
    // is over and refreshing it would resurrect a session the user lost.
    if (!onKeepalive || fired || isIdle() || !needsKeepalive()) return;
    markSynced();
    onKeepalive();
  };

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
