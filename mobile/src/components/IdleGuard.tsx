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
import { isIdle, markActivity } from '../lib/idle';

// How often we re-check while the app is in the foreground.
const CHECK_INTERVAL_MS = 15 * 1000;

export function IdleGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  // Read inside callbacks without re-subscribing the listeners on every render.
  const signedIn = useRef(false);
  signedIn.current = !!user;

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

    const timer = setInterval(endIfIdle, CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void endIfIdle();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [user, signOut]);

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        markActivity();
        return false; // Observe only — never claim the gesture.
      }}
    >
      {children}
    </View>
  );
}
