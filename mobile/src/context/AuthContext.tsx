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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignupInput) => Promise<void>;
  refreshUser: () => Promise<void>; // re-pull /auth/me (e.g. after onboarding)
  signOut: () => Promise<void>;
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

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password);
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

  const signOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, refreshUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
