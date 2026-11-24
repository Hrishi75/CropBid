// =============================================================================
// AuthContext — session state for the native app
// =============================================================================
// On launch we try a silent refresh using the token in secure-store; if it
// works the user lands straight in the app. signIn/signOut wrap the endpoints.
// =============================================================================

import axios from 'axios';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  getRefreshToken,
  rotateSession,
  setAccessToken,
  setActAs,
  setOnLogout,
  setRefreshToken,
} from '../api/client';
import { forgetShopAdd } from '../lib/resumeAfterLogin';
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

/** Which side a seller who is also approved to buy is working on. */
export type AccountMode = 'SELL' | 'BUY';

const MODE_KEY = 'cropbid.mode';
// How often a launch that had no signal tries to restore the session.
const RESTORE_RETRY_MS = 15 * 1000;

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
  const [restorePending, setRestorePending] = useState(false);
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
    setOnLogout(() => { forgetShopAdd(); setUser(null); });
    return () => setOnLogout(null);
  }, []);

  // Silent refresh from the persisted refresh token. 'retry' means the server
  // never answered, so the session is still good and only the network is not.
  const restoreSession = useCallback(async (): Promise<'done' | 'retry'> => {
    if (!(await getRefreshToken())) return 'done';
    let session;
    try {
      // The shared rotation: a guest screen's 401 may be refreshing right now.
      // A refusal has already cleared the stored token inside it.
      session = await rotateSession();
    } catch (e) {
      // Opening the app with no signal, or while the API is restarting, must
      // not throw away the session.
      return axios.isAxiosError(e) && ![401, 403].includes(e.response?.status ?? 0)
        ? 'retry'
        : 'done';
    }
    if (session.superseded) return 'done';
    try {
      // An account support has reset is not restored into the app either. It
      // is left at the sign-in screen, where the same check explains it.
      refuseResetSession(session.user);
    } catch {
      setAccessToken(null);
      await setRefreshToken(null);
      return 'done';
    }
    setUser(session.user);
    return 'done';
  }, []);

  useEffect(() => {
    restoreSession()
      .then((result) => setRestorePending(result === 'retry'))
      .finally(() => setLoading(false));
  }, [restoreSession]);

  // After a launch with no signal, keep trying until the session comes back,
  // on a timer and whenever the app returns to the foreground.
  useEffect(() => {
    if (!restorePending || user) return;
    let busy = false;
    let on = true;
    const attempt = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await restoreSession();
        if (on && result === 'done') setRestorePending(false);
      } catch {
        // Secure storage failed to read; the next tick tries again.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(attempt, RESTORE_RETRY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt();
    });
    return () => {
      on = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [restorePending, user, restoreSession]);

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
    forgetShopAdd();
    setUser(null);
    switchMode('SELL');
  }, [switchMode]);

  // For flows where the server session no longer exists (account deletion):
  // clear tokens and state without calling /logout, which would just 401.
  const dropSession = useCallback(async () => {
    setAccessToken(null);
    await setRefreshToken(null);
    forgetShopAdd();
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
