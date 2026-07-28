// =============================================================================
// AuthContext — session state for the native app
// =============================================================================
// On launch we try a silent refresh using the token in secure-store; if it
// works the user lands straight in the app. signIn/signOut wrap the endpoints.
// =============================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import api, {
  getRefreshToken,
  setAccessToken,
  setOnLogout,
  setRefreshToken,
} from '../api/client';
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
  type SignupInput,
} from '../api/endpoints';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean; // bootstrap (silent refresh) in progress
  signIn: (identifier: string, password: string) => Promise<void>; // phone or email
  signUp: (input: SignupInput) => Promise<void>;
  refreshUser: () => Promise<void>; // re-pull /auth/me (e.g. after onboarding)
  applyUser: (user: User) => void; // swap in a fresh user (e.g. after editing the profile)
  signOut: () => Promise<void>;
  dropSession: () => Promise<void>; // local-only teardown when the server session is already gone
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // A refresh that fails inside the interceptor must drop the session.
  useEffect(() => {
    setOnLogout(() => setUser(null));
    return () => setOnLogout(null);
  }, []);

  // Silent refresh on launch from the persisted refresh token.
  useEffect(() => {
    (async () => {
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) return;
        const { data } = await api.post('/auth/refresh', { refreshToken });
        setAccessToken(data.accessToken);
        if (data.refreshToken) await setRefreshToken(data.refreshToken);
        setUser(data.user);
      } catch {
        setAccessToken(null);
        await setRefreshToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const u = await apiLogin(identifier, password);
    setUser(u);
  }, []);

  const signUp = useCallback(async (input: SignupInput) => {
    const u = await apiSignup(input);
    setUser(u);
  }, []);

  // Onboarding sets the role profile server-side; pull the fresh user so the
  // navigator drops the onboarding gate and shows the app.
  const refreshUser = useCallback(async () => {
    setUser(await fetchMe());
  }, []);

  // Endpoints that already return the updated user (e.g. PATCH /auth/me) can
  // hand it straight to state without a second /auth/me round-trip.
  const applyUser = useCallback((next: User) => setUser(next), []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // POST /auth/logout 401s when the session has already expired — which is
      // exactly what an idle sign-out looks like. The tokens are cleared either
      // way (apiLogout does it in a finally), so drop local state regardless or
      // the app would sit on a signed-in UI with no credentials behind it.
    }
    setUser(null);
  }, []);

  // For flows where the server session no longer exists (account deletion):
  // clear tokens and state without calling /logout, which would just 401.
  const dropSession = useCallback(async () => {
    setAccessToken(null);
    await setRefreshToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, refreshUser, applyUser, signOut, dropSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
