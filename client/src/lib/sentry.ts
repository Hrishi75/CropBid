// =============================================================================
// Error monitoring on the website (Sentry)
// =============================================================================
// Twin of server/src/instrument.ts, and held to the same rule: off unless
// VITE_SENTRY_DSN is set at build time, and sent as little personal data as an
// error report can be made of. In the browser that means more care, not less:
// the address bar of /reset-password carries a working token, and the console
// is where a careless log would print a phone number.
//
//   - dataCollection all off: no user identity, cookies, headers, bodies,
//     query strings or stack-frame variables
//   - no session tracking: it is the one integration that counts visits, and
//     the cookie notice says nothing optional runs (CookieNotice.tsx)
//   - no console breadcrumbs, and every URL loses its query and hash
//   - errors only: no tracing, no session replay
// =============================================================================

import * as Sentry from '@sentry/react';

const stripQuery = (url: unknown) => (typeof url === 'string' ? url.split(/[?#]/)[0] : url);

export function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'console') return null;
  if (crumb.data) {
    for (const key of ['url', 'from', 'to']) {
      if (crumb.data[key]) crumb.data[key] = stripQuery(crumb.data[key]);
    }
  }
  return crumb;
}

export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    event.request.url = stripQuery(event.request.url) as string | undefined;
  }
  delete event.user;
  return event;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || typeof window === 'undefined') return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}
