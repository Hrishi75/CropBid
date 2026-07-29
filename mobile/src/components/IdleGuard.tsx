// =============================================================================
// IdleGuard — signs the user out after 15 minutes without a touch
// =============================================================================
// Wraps the app below AuthProvider. Two things end an idle session:
//
//   1. A touch anywhere re-arms the clock. We use the RESPONDER CAPTURE phase
//      and always return false, so we observe every gesture on its way down
//      without ever becoming the responder — scroll views, buttons and inputs
//      behave exactly as they would without this wrapper.
//
//   2. Returning to the foreground checks the clock immediately. JS timers are
//      frozen or throttled while the app is backgrounded, so the interval alone
//      can't be trusted to fire; the AppState transition is what catches the
//      "phone was in a pocket for an hour" case.
//
// The server enforces the same window independently (see src/lib/idle.ts), so
// this is about signing out promptly and visibly, not about being the gate.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { keepAliveSession } from '../api/client';
import { isIdle, markActivity } from '../lib/idle';

// How often we re-check while the app is in the foreground.
const CHECK_INTERVAL_MS = 15 * 1000;

export function IdleGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  // Read inside callbacks without re-subscribing the listeners on every render.
  const signedIn = useRef(false);
  signedIn.current = !!user;
  // Lets the touch handler end an already-expired session — see the ordering
  // note on onStartShouldSetResponderCapture below.
  const endIfIdleRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!user) return;

    // A fresh sign-in starts a fresh clock — otherwise a stamp left over from
    // the previous session could trip the check straight away.
    markActivity();

    let ended = false;
    async function endIfIdle() {
      if (ended || !signedIn.current || !isIdle()) return;
      ended = true;
      try {
        await signOut();
      } catch {
        // signOut already clears local state on failure; nothing to retry.
      }
    }

    endIfIdleRef.current = () => void endIfIdle();

    const timer = setInterval(endIfIdle, CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void endIfIdle();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
      endIfIdleRef.current = () => {};
    };
  }, [user, signOut]);

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        // ORDER MATTERS. Check the clock BEFORE re-arming it: a touch that
        // lands after the deadline is the user returning to a session that
        // already ended, so it has to sign them out. Marking first would hide
        // the expiry from isIdle() and then let the keepalive rotate the
        // refresh token, reviving a session the server was about to drop.
        if (signedIn.current && isIdle()) {
          endIfIdleRef.current();
          return false;
        }
        markActivity();
        // Touching re-arms the local clock; this re-arms the server's. It
        // self-throttles to once per KEEPALIVE_MS and no-ops when signed out.
        if (signedIn.current) void keepAliveSession();
        return false; // Observe only — never claim the gesture.
      }}
    >
      {children}
    </View>
  );
}
