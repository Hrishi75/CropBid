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
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import api, {
  getRefreshToken,
  setAccessToken,
  setActAs,
  setOnLogout,
  setRefreshToken,
} from '../api/client';
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
  verifySignupOtp as apiVerifySignupOtp,
  resendSignupOtp as apiResendSignupOtp,
  refuseResetSession,
  type PendingSignup,
  type SignupInput,
  type SignupResult,
} from '../api/endpoints';
import type { User } from '../api/types';
import { markSynced } from '../lib/idle';

/** Which side a seller who is also approved to buy is working on. */
export type AccountMode = 'SELL' | 'BUY';

const MODE_KEY = 'cropbid.mode';

// The device remembers which side the account was on, so reopening the app
// lands where they left off. A preference, not a credential: plain storage.
async function readMode(): Promise<AccountMode> {
  try {
    const v = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(MODE_KEY)
      : await SecureStore.getItemAsync(MODE_KEY);
    return v === 'BUY' ? 'BUY' : 'SELL';
  } catch {
    return 'SELL';
  }
}
async function writeMode(m: AccountMode): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(MODE_KEY, m);
    else await SecureStore.setItemAsync(MODE_KEY, m);
  } catch {
    // Not remembering the side is not worth telling anyone about.
  }
}

/** A seller whose buyer application has also been approved. */
export function canSwitchToBuying(u: User | null | undefined): boolean {
  return u?.role === 'FARMER' && u.buyerProfile?.status === 'APPROVED';
}

interface AuthState {
  /**
   * The account as the app should treat it. In buying mode a seller appears
   * as a BUYER, so every screen, tab and check that reads `user.role` shows
   * the buyer side without knowing modes exist. The server agrees because the
   * API client sends X-Act-As at the same moment.
   */
  user: User | null;
  /** The account's own role, whatever mode it is in. */
  accountRole: User['role'] | null;
  mode: AccountMode;
  /** Switch sides. Only takes effect for an account that may buy. */
  switchMode: (m: AccountMode) => void;
  loading: boolean; // bootstrap (silent refresh) in progress
  signIn: (identifier: string, password: string) => Promise<void>; // phone or email
  // Resolves to 'verification-required' for buyers — they are NOT signed in
  // until verifySignUp succeeds.
  signUp: (input: SignupInput) => Promise<SignupResult>;
  verifySignUp: (pendingId: string, code: string) => Promise<void>;
  resendSignUpCode: (pendingId: string) => Promise<PendingSignup>;
  refreshUser: () => Promise<void>; // re-pull /auth/me (e.g. after onboarding)
  applyUser: (user: User) => void; // swap in a fresh user (e.g. after editing the profile)
  signOut: () => Promise<void>;
  dropSession: () => Promise<void>; // local-only teardown when the server session is already gone
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AccountMode>('SELL');

  // The remembered side, read once at launch.
  useEffect(() => { readMode().then(setMode); }, []);

  // Buying mode applies only while the account may actually buy. If a reviewer
  // revokes the buyer approval, the next /auth/me puts the account back on the
  // selling side instead of leaving it on screens that would all 403.
  const buying = mode === 'BUY' && canSwitchToBuying(user);
  // Set during render, not in an effect: the first request any buyer screen
  // makes on mount must already carry the header.
  setActAs(buying ? 'BUYER' : null);

  const switchMode = useCallback((m: AccountMode) => {
    setMode(m);
    void writeMode(m);
  }, []);

  const effectiveUser = useMemo<User | null>(
    () => (user && buying ? { ...user, role: 'BUYER' } : user),
    [user, buying],
  );

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
        // An account support has reset is not restored into the app either.
        // Throwing lands in the catch below, which drops the stored token and
        // leaves them at the sign-in screen, where the same check explains it.
        refuseResetSession(data.user);
        setAccessToken(data.accessToken);
        if (data.refreshToken) await setRefreshToken(data.refreshToken);
        markSynced(); // Launch refresh re-armed the server's idle window.
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

  // Every new account is a shopper and is signed in here. The 'verification-
  // required' branch belongs to the old buyer signup, which no request reaches
  // any more; verifySignUp below only finishes one already in flight.
  const signUp = useCallback(async (input: SignupInput): Promise<SignupResult> => {
    const result = await apiSignup(input);
    if (result.status === 'created') setUser(result.user);
    return result;
  }, []);

  const verifySignUp = useCallback(async (pendingId: string, code: string) => {
    setUser(await apiVerifySignupOtp(pendingId, code));
  }, []);

  const resendSignUpCode = useCallback(
    (pendingId: string) => apiResendSignupOtp(pendingId),
    [],
  );

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
    switchMode('SELL');
  }, [switchMode]);

  // For flows where the server session no longer exists (account deletion):
  // clear tokens and state without calling /logout, which would just 401.
  const dropSession = useCallback(async () => {
    setAccessToken(null);
    await setRefreshToken(null);
    setUser(null);
    switchMode('SELL');
  }, [switchMode]);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser, accountRole: user?.role ?? null, mode: buying ? 'BUY' : 'SELL', switchMode,
        loading, signIn, signUp, verifySignUp, resendSignUpCode,
        refreshUser, applyUser, signOut, dropSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
