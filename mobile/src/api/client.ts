// =============================================================================
// API client — axios instance for the native app
// =============================================================================
// Mirrors the web client (client/src/lib/axios.ts) but adapted for native:
//   - Access token kept in memory (lost on app kill, refreshed on launch)
//   - Refresh token persisted in expo-secure-store (no cookie jar on native)
//   - Every request carries `X-Client: mobile` so the API returns the rotated
//     refresh token in the JSON body; /refresh sends the stored token in body.
// =============================================================================

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isIdle, markSynced, needsKeepalive } from '../lib/idle';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://cropbid-api-oyfv.onrender.com/api';

// Uploaded images are served from the API origin (without the /api suffix).
export const MEDIA_BASE = API_URL.replace(/\/api\/?$/, '');
export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${MEDIA_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

const REFRESH_KEY = 'cropbid.refreshToken';

let accessToken: string | null = null;
let onLogout: (() => void) | null = null;
// Buying mode for a seller also approved to buy (a local shop stocking up).
// Sent as X-Act-As: BUYER; the server honours it only for an account whose
// buyer profile is APPROVED (server/src/middleware/auth.ts). Set by
// AuthContext, never by a screen.
let actAs: 'BUYER' | null = null;
export function setActAs(mode: 'BUYER' | null) {
  actAs = mode;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}
// AuthContext registers a callback so a failed refresh can drop the session.
export function setOnLogout(cb: (() => void) | null) {
  onLogout = cb;
}

// expo-secure-store has no web implementation, so on web (the dev preview) we
// fall back to localStorage. Native uses the encrypted keystore.
export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(REFRESH_KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(REFRESH_KEY);
}
export async function setRefreshToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (token) globalThis.localStorage?.setItem(REFRESH_KEY, token);
      else globalThis.localStorage?.removeItem(REFRESH_KEY);
    } catch {
      // storage unavailable — token simply won't persist in this preview
    }
    return;
  }
  if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
  else await SecureStore.deleteItemAsync(REFRESH_KEY);
}

const api = axios.create({ baseURL: API_URL });

// --- Request interceptor: identify as mobile + attach access token ---
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers['X-Client'] = 'mobile';
  if (accessToken) config.headers['Authorization'] = `Bearer ${accessToken}`;
  if (actAs) config.headers['X-Act-As'] = actAs;
  return config;
});

// ---------------------------------------------------------------------------
// rotateSession — the one place the app calls /auth/refresh
// ---------------------------------------------------------------------------
// The server accepts only the newest refresh token, so two refreshes of the same
// token cannot both win, and the loser's 401 would read as "signed out" and
// delete the winner's new token. Every caller (a 401, the launch restore, its
// retries, an admin's keepalive) therefore shares this one in-flight rotation.
//
// A sign-in or log-out landing while it is in flight changes the stored token.
// The answer for the old one is then `superseded`: it neither replaces nor
// deletes what is stored now.
export interface RotatedSession {
  accessToken: string | null;
  user?: any;
  superseded?: boolean;
}

let rotation: Promise<RotatedSession> | null = null;

async function runRotation(): Promise<RotatedSession> {
  const sent = await getRefreshToken();
  const superseded = async () => (await getRefreshToken()) !== sent;
  try {
    if (!sent) throw new Error('No refresh token');
    const { data } = await api.post('/auth/refresh', { refreshToken: sent });
    if (await superseded()) return { accessToken, superseded: true };
    setAccessToken(data.accessToken);
    if (data.refreshToken) await setRefreshToken(data.refreshToken);
    markSynced(); // This rotation re-armed the server's window too.
    return { accessToken: data.accessToken, user: data.user };
  } catch (e: any) {
    if (await superseded()) return { accessToken, superseded: true };
    // Only a refusal ends the session: the server said this token is no good
    // (401/403), or there was none to send. A dropped connection, a 429 or a
    // 5xx says nothing about the session.
    const status = e?.response?.status;
    if (!e?.response ? e?.message === 'No refresh token' : status === 401 || status === 403) {
      setAccessToken(null);
      await setRefreshToken(null);
      onLogout?.();
    }
    throw e;
  }
}

export function rotateSession(): Promise<RotatedSession> {
  if (!rotation) rotation = runRotation().finally(() => { rotation = null; });
  return rotation;
}

// --- Response interceptor: silent refresh on 401 ---
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const recoverable =
      original &&
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login');

    if (!recoverable) return Promise.reject(error);

    original!._retry = true;
    const session = await rotateSession();
    if (session.accessToken) original!.headers['Authorization'] = `Bearer ${session.accessToken}`;
    return api(original!);
  },
);

// ---------------------------------------------------------------------------
// keepAliveSession — re-arm the server's idle window for an active admin
// ---------------------------------------------------------------------------
// Touching the screen re-arms the LOCAL clock only; the server's window is the
// refresh token. IdleGuard calls this on interaction so a screen worked in
// without firing requests can't drift out of sync and sign an admin out on
// submit. See src/lib/idle.ts. A dropped connection here is a background blip:
// the next touch retries.
export async function keepAliveSession(): Promise<void> {
  if (rotation || isIdle() || !needsKeepalive()) return;
  // Claim the interval before awaiting, so a second call can't slip in behind.
  markSynced();
  await rotateSession().catch(() => {});
}

// Pull a human-readable message out of an axios error.
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as { message?: string })?.message ?? e.message ?? fallback;
  }
  return fallback;
}

export default api;
