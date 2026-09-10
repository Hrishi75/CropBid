// =============================================================================
// AuthContext — the shopper's session
// =============================================================================
// Phone plus a six-digit code, and nothing else. Daily deliberately does not
// offer the password lane the API still supports: a household buying vegetables
// should not be asked to invent a password, and every extra field on that
// screen is a shopper who does not finish.
//
// THE ACCESS TOKEN LIVES IN MEMORY, the refresh token in expo-secure-store
// (localStorage on the web preview). That is the api/client contract, lifted
// from the business app unchanged. On launch this tries a silent refresh: if
// the stored token is still good, the shopper is signed in before the first
// screen paints and never sees a sign-in wall they did not ask for.
//
// SIGNING OUT DOES NOT CLEAR THE BASKET. CartContext keys its storage by user
// id, so the basket is simply set aside and found again on the next sign-in.
// Throwing away a filled basket because someone signed out on a shared phone is
// a worse failure than showing it again later.
// =============================================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getRefreshToken, setAccessToken, setRefreshToken, setOnLogout } from '../api/client';
import { fetchMe, signOut as apiSignOut, updateMe } from '../api/endpoints';
import { loadCity, saveCity } from '../lib/city';
import type { User } from '../api/types';

interface AuthValue {
  user: User | null;
  /** True until the launch-time refresh has settled, either way. */
  loading: boolean;
  signedIn: boolean;
  setUser: (u: User | null) => void;
  signOut: () => Promise<void>;
  updateProfile: (patch: { name?: string; location?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // A failed refresh anywhere in the app drops the session here too, so the
    // UI cannot keep rendering a signed-in shell around a dead token.
    setOnLogout(() => setUser(null));
    return () => setOnLogout(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) return;

        const { data } = await api.post('/auth/refresh', { refreshToken });
        setAccessToken(data.accessToken);
        if (data.refreshToken) await setRefreshToken(data.refreshToken);

        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        // Expired or revoked. Not an error worth showing: the shopper simply
        // starts signed out, which is where a first-time visitor starts too.
        setAccessToken(null);
        await setRefreshToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ADOPT THE DEVICE'S CITY ONTO A NEW ACCOUNT.
  //
  // A guest picks a delivery city at the gate and it is kept on the device,
  // because there is no account to hang it on yet. Sign-in creates one with
  // location null, and the server REFUSES a purchase from an account with no
  // city ("Choose your delivery city before ordering"), so without this a
  // shopper who browsed as a guest, filled a basket and signed in hits that
  // wall at the checkout, having already chosen a city once.
  //
  // Runs only when the account has no city of its own: an account that already
  // has one is the authority, and this must never overwrite a city the shopper
  // set deliberately from another device.
  useEffect(() => {
    if (!user || (user.location ?? '').trim() !== '') return;

    let cancelled = false;
    (async () => {
      const city = await loadCity();
      if (!city || cancelled) return;
      try {
        const updated = await updateMe({ location: city });
        if (!cancelled) setUser(updated);
      } catch {
        // Not fatal, and not worth interrupting a sign-in for. The city is
        // still settable on the You tab, and the checkout will say so.
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch: { name?: string; location?: string }) => {
    const updated = await updateMe(patch);
    setUser(updated);
    // Keep the device copy in step, so the shelf and the account agree on the
    // next launch even before the session is restored.
    if (patch.location) await saveCity(patch.location);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, signedIn: user !== null, setUser, signOut, updateProfile }),
    [user, loading, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
