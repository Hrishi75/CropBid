// =============================================================================
// Auth Context — Central Authentication State
// =============================================================================
// This React Context provides auth state to the ENTIRE application.
// Any component can use useAuth() to:
//   - Check if the user is logged in
//   - Get the current user's data and role
//   - Call login(), signup(), logout()
//
// HOW IT WORKS:
// 1. On app load, it calls /api/auth/refresh to restore session from cookie
// 2. On login/signup, it stores the access token in memory and user in state
// 3. On logout, it clears everything and redirects to login
//
// WHY CONTEXT INSTEAD OF REDUX/ZUSTAND?
// Auth state is simple (one user object + loading boolean). Context is built
// into React, requires no extra libraries, and is perfectly efficient for
// data that changes infrequently (login/logout events).
// =============================================================================

import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api, { keepAliveSession, setAccessToken } from '../lib/axios';
import {
  clearActivity,
  isIdle,
  markActivity,
  markSynced,
  setLogoutReason,
  watchIdle,
} from '../lib/idle';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<SignupResult>;
  verifySignupOtp: (pendingId: string, code: string) => Promise<void>;
  resendSignupOtp: (pendingId: string) => Promise<PendingSignup>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

interface SignupData {
  name: string;
  phone: string; // primary contact + login identifier
  email?: string;
  password: string;
  role: 'FARMER' | 'BUYER';
  country?: string;
  currency?: string;
  language?: string;
}

// A buyer signup that has been parked pending email verification. No account
// exists yet — pendingId identifies the parked details, not a user.
export interface PendingSignup {
  pendingId: string;
  email: string;
  expiresAt: string;
}

// signup() ends one of two ways depending on role, so callers have to branch:
// farmers are signed in on the spot, buyers have a code to enter first.
export type SignupResult =
  | { status: 'created' }
  | { status: 'verification-required'; pending: PendingSignup };

const AuthContext = createContext<AuthContextType | null>(null);

// Non-secret UX hint: "this browser had a session". Recorded on every auth
// transition so a surface can tell a returning visitor from a first-time one
// without waiting on /auth/refresh. The actual token still lives in memory
// only — this is just a boolean flag.
//
// NOTE: nothing reads it at the moment. The root route used to, to decide
// whether to block the homepage on the session check; it no longer blocks
// anyone (see RootRedirect), which is what removed the worst of the reload
// flicker. Kept because it is the cheap answer to "should this slot wait for
// auth rather than guess?" if a surface needs one again.
export const SESSION_HINT_KEY = 'cb_has_session';
function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch { /* localStorage unavailable — ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // True until initial auth check

  // -------------------------------------------------------------------------
  // On mount: Try to restore session from refresh token cookie
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function restoreSession() {
      // Idle sessions don't survive a reload either. The server would reject
      // the expired refresh token anyway; checking first saves the round-trip
      // and lets us name the reason on the login screen.
      if (isIdle()) {
        clearActivity();
        setLogoutReason('idle');
        setSessionHint(false);
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        setUser(data.user);
        setSessionHint(true);
        markActivity(true); // Restored session starts its idle clock now
        markSynced();       // ...and this call just rotated the refresh token
      } catch {
        // No valid refresh token — user is not logged in
        // This is normal for first-time visitors
        setSessionHint(false);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();

    // Listen for forced logout (from axios interceptor when refresh fails)
    const handleLogout = () => {
      setAccessToken(null);
      setUser(null);
      setSessionHint(false);
      clearActivity();
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // -------------------------------------------------------------------------
  // Idle timeout — sign out after 15 minutes with no interaction
  // -------------------------------------------------------------------------
  // Only runs while someone is signed in; see lib/idle.ts for what counts as
  // activity and why the server enforces the same window independently.
  useEffect(() => {
    if (!user) return;

    return watchIdle(
      () => {
        setLogoutReason('idle');
        // Fire-and-forget: /auth/logout clears the server-side refresh token, but
        // local state must drop regardless of whether that call succeeds.
        void logout();
      },
      // Keepalive: interaction that makes no API calls (reading a long page,
      // filling a long form) still has to reach the server, or its refresh
      // token ages out while this tab believes the user is active. It shares
      // the interceptor's refresh lock — see keepAliveSession in lib/axios.
      () => void keepAliveSession(),
    );
  }, [user]);

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  async function login(identifier: string, password: string) {
    const { data } = await api.post('/auth/login', { identifier, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setSessionHint(true);
    // Start the idle clock fresh — a stale stamp from an earlier session would
    // otherwise trip the watchdog the instant it starts.
    markActivity(true);
    markSynced();
  }

  // -------------------------------------------------------------------------
  // Signup
  // -------------------------------------------------------------------------
  // Farmers come back 201 with a session. Buyers come back 202 with a pendingId
  // and no tokens: their account does not exist until the emailed code is
  // returned to verifySignupOtp below.
  async function signup(signupData: SignupData): Promise<SignupResult> {
    const { data, status } = await api.post('/auth/signup', signupData);

    if (status === 202 && data.pendingSignup) {
      return { status: 'verification-required', pending: data.pendingSignup };
    }

    setAccessToken(data.accessToken);
    setUser(data.user);
    setSessionHint(true);
    markActivity(true);
    markSynced();
    return { status: 'created' };
  }

  // -------------------------------------------------------------------------
  // Buyer signup — step 2
  // -------------------------------------------------------------------------
  // The account is created server-side by this call, so this is where a buyer's
  // session actually begins — which means it starts the idle clock too, exactly
  // like login and a farmer's signup do. Without markActivity a stale stamp
  // from an earlier visit would trip the idle watchdog the moment the buyer
  // lands on their dashboard.
  async function verifySignupOtp(pendingId: string, code: string) {
    const { data } = await api.post('/auth/signup/verify', { pendingId, code });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setSessionHint(true);
    markActivity(true);
    markSynced();
  }

  // Asks for a fresh code. The previous one stops working immediately.
  // Deliberately does NOT touch the idle clock: no session exists yet.
  async function resendSignupOtp(pendingId: string): Promise<PendingSignup> {
    const { data } = await api.post('/auth/signup/resend', { pendingId });
    return data.pendingSignup;
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------
  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the API call fails, clear local state
    }
    setAccessToken(null);
    setUser(null);
    setSessionHint(false);
    clearActivity();
  }

  // -------------------------------------------------------------------------
  // Update user (after profile changes)
  // -------------------------------------------------------------------------
  function updateUser(updatedUser: User) {
    setUser(updatedUser);
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, signup, verifySignupOtp, resendSignupOtp, logout, updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — cleaner than useContext(AuthContext) everywhere
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
