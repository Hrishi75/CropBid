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
  return config;
});

// --- Response interceptor: silent refresh on 401 ---
let isRefreshing = false;
let queue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

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

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        original!.headers['Authorization'] = `Bearer ${token}`;
        return api(original!);
      });
    }

    original!._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await api.post('/auth/refresh', { refreshToken });
      setAccessToken(data.accessToken);
      if (data.refreshToken) await setRefreshToken(data.refreshToken);
      markSynced(); // This rotation re-armed the server's window too.

      queue.forEach((p) => p.resolve(data.accessToken));
      queue = [];

      original!.headers['Authorization'] = `Bearer ${data.accessToken}`;
      return api(original!);
    } catch (e) {
      queue.forEach((p) => p.reject(e));
      queue = [];
      setAccessToken(null);
      await setRefreshToken(null);
      onLogout?.();
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  },
);

// ---------------------------------------------------------------------------
// keepAliveSession — re-arm the server's idle window for an active user
// ---------------------------------------------------------------------------
// Touching the screen re-arms the LOCAL clock only; the server's window is the
// refresh token, which rotates only here. IdleGuard calls this on interaction
// so a screen the user works in without firing requests can't drift out of
// sync and sign them out on submit. See src/lib/idle.ts.
//
// Skipped when a 401-driven refresh is already in flight: the server rejects
// any refresh token that isn't the newest one it issued, so two overlapping
// rotations would leave one holding a revoked token.
export async function keepAliveSession(): Promise<void> {
  if (isRefreshing || isIdle() || !needsKeepalive()) return;

  isRefreshing = true;
  // Claim the interval before awaiting, so a second call can't slip in behind.
  markSynced();
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return;
    const { data } = await api.post('/auth/refresh', { refreshToken });
    setAccessToken(data.accessToken);
    if (data.refreshToken) await setRefreshToken(data.refreshToken);
  } catch {
    // Leave it. A genuinely dead session is caught by the next real request's
    // 401 (which signs out with a reason); a network blip retries at the next
    // keepalive, still well inside the window.
  } finally {
    isRefreshing = false;
  }
}

// Pull a human-readable message out of an axios error.
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as { message?: string })?.message ?? e.message ?? fallback;
  }
  return fallback;
}

export default api;
