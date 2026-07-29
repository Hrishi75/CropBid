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
  signup: (data: SignupData) => Promise<void>;
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

const AuthContext = createContext<AuthContextType | null>(null);

// Non-secret UX hint: "this browser had a session". Lets the root route show the
// static landing immediately for anonymous visitors instead of blocking on the
// /auth/refresh call (which is slow when the API is cold-starting). The actual
// token still lives in memory only — this is just a boolean flag.
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
  async function signup(signupData: SignupData) {
    const { data } = await api.post('/auth/signup', signupData);
    setAccessToken(data.accessToken);
    setUser(data.user);
    setSessionHint(true);
    markActivity(true);
    markSynced();
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
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser }}>
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
