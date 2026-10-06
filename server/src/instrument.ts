// =============================================================================
// Error monitoring (Sentry), loaded before anything else
// =============================================================================
// Part of noticing a breach in time to report it (docs/breach-runbook.md): an
// error spike or an unfamiliar crash is often the first sign. Does nothing at
// all unless SENTRY_DSN is set, so development and tests never send anything.
//
// SENTRY IS A PROCESSOR OF WHATEVER IT IS SENT, so it is sent as little
// personal data as an error report can be made of:
//   - dataCollection all off: no user identity, cookies, headers, query
//     strings, bodies, database query values, AI prompts, or the values of
//     local variables in a stack frame. A body holds passwords and OTPs,
//     headers hold tokens, /reset-password?token= puts a working credential
//     in the URL, and a frame's variables can hold any of them
//   - beforeSend strips the same again, in case an integration fills them in
//     by some other route
//   - no console breadcrumbs, because the log carries phone numbers and,
//     in development, sign-in codes; and URLs in breadcrumbs lose their query
//   - errors only, no performance tracing
// What is left is the stack trace, the route and the error message.
// =============================================================================

import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';

dotenv.config();

const stripQuery = (url: unknown) => (typeof url === 'string' ? url.split('?')[0] : url);

export const sentryEnabled = Boolean(process.env.SENTRY_DSN);

export function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'console') return null;
  if (crumb.data?.url) crumb.data.url = stripQuery(crumb.data.url);
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

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}
