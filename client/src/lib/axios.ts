// =============================================================================
// Axios Instance with Automatic Token Refresh
// =============================================================================
// THIS IS ONE OF THE MOST IMPORTANT FILES IN THE CLIENT.
//
// Every API call from the client flows through this axios instance.
// It automatically handles:
//   1. Attaching the access token to every request
//   2. Detecting 401 (token expired) responses
//   3. Silently calling /api/auth/refresh to get a new token
//   4. Retrying the failed request with the new token
//   5. Logging out the user if refresh also fails
//
// The component making the API call NEVER KNOWS the token expired.
// From its perspective, the request just takes a bit longer.
//
// HOW INTERCEPTORS WORK:
// Axios interceptors are like middleware for HTTP requests/responses.
//   - Request interceptor: runs BEFORE every request (we add the token here)
//   - Response interceptor: runs AFTER every response (we handle 401 here)
// =============================================================================

import axios from 'axios';
import { markSynced, setLogoutReason } from './idle';

// Create a custom axios instance (not the global one)
// This lets us add interceptors without affecting other axios usage
// In dev, Vite proxies /api to the local Express server (vite.config.ts).
// In prod (Vercel), VITE_API_URL points at the deployed backend, e.g.
//   https://cropbid-api.onrender.com/api
// Fallback to '/api' so local dev keeps working without an .env file.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,  // Send cookies (refresh token) with every request
});

// ---------------------------------------------------------------------------
// Token Storage — In-memory only (not localStorage!)
// ---------------------------------------------------------------------------
// WHY NOT LOCALSTORAGE?
// localStorage is accessible by any JavaScript on the page. If an XSS
// vulnerability exists, an attacker can steal the token. In-memory storage
// means the token disappears on page refresh (but the refresh token cookie
// automatically gets a new one). Security > convenience.

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ---------------------------------------------------------------------------
// Request Interceptor — Add token to every request
// ---------------------------------------------------------------------------
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Response Interceptor — Handle 401 with automatic refresh
// ---------------------------------------------------------------------------
// Track whether we're already refreshing (to prevent infinite loops)
let isRefreshing = false;

// Queue of requests that failed while we were refreshing
// Once refresh completes, we retry them all with the new token
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  // Success — just pass through
  (response) => response,

  // Error — check if it's a 401 we can fix
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401 errors, and not on the refresh endpoint itself
    // (that would cause an infinite loop)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      if (isRefreshing) {
        // Another request is already refreshing — queue this one
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Call the refresh endpoint (uses the httpOnly cookie)
        const { data } = await api.post('/auth/refresh');

        // Store the new access token
        setAccessToken(data.accessToken);

        // The refresh token rotated here too, so the idle keepalive can hold
        // off — this call already re-armed the server's window.
        markSynced();

        // Retry all queued requests with the new token
        processQueue(null, data.accessToken);

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError: any) {
        // Refresh failed — token is fully expired, user must log in again
        processQueue(refreshError, null);
        setAccessToken(null);

        // SESSION_IDLE means the refresh token aged out rather than being
        // revoked, so the login page can say why instead of just appearing.
        if (refreshError?.response?.data?.code === 'SESSION_IDLE') {
          setLogoutReason('idle');
        }

        // Redirect to login (the AuthContext will handle this)
        window.dispatchEvent(new CustomEvent('auth:logout'));

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// keepAliveSession — re-arm the server's idle window for an active user
// ---------------------------------------------------------------------------
// Marking activity re-arms the LOCAL clock only; the server's window is the
// refresh token, which rotates only through this endpoint. The idle watcher
// calls this on real interaction so a page the user reads or types into
// without firing requests can't drift out of sync and sign them out on submit.
// See lib/idle.ts for the timing and the cross-tab rules.
//
// This shares the interceptor's `isRefreshing` lock and `failedQueue` rather
// than calling /auth/refresh on its own. It has to: the server rejects any
// refresh token that isn't the newest it issued, so a keepalive overlapping a
// 401-driven refresh would leave one of the two holding a revoked token — the
// exact sign-out this exists to prevent. Holding the lock also means a request
// that 401s meanwhile parks on the queue expecting us to settle it, so every
// exit path drains it.
export async function keepAliveSession(): Promise<void> {
  // Already rotating — that call re-arms the window just as well as ours would.
  if (isRefreshing) return;

  isRefreshing = true;
  try {
    const { data } = await api.post('/auth/refresh');
    setAccessToken(data.accessToken);
    markSynced();
    processQueue(null, data.accessToken);
  } catch (err: any) {
    const stranded = failedQueue.length > 0;
    processQueue(err, null);

    // Only end the session if a REAL request was waiting on us — a 401 followed
    // by a failed refresh is the interceptor's own case and means the session
    // is genuinely gone. A keepalive failing alone is a background blip with
    // minutes of window left; the next interaction retries.
    if (stranded) {
      setAccessToken(null);
      if (err?.response?.data?.code === 'SESSION_IDLE') setLogoutReason('idle');
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
  } finally {
    isRefreshing = false;
  }
}

export default api;
