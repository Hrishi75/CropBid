// =============================================================================
// PageAnalytics — Cloudflare Web Analytics, the site's page-view counter
// =============================================================================
// Cookie-free and sets nothing on the visitor's device, which is what lets the
// cookie notice stay a notice rather than a consent gate (CookieNotice.tsx).
// The privacy page names it; replacing it with anything that sets a cookie or
// follows people across sites changes both pages.
//
// The token comes from the VITE_CF_ANALYTICS_TOKEN build variable. It is
// public by design (it is in the page every visitor loads and only says which
// site the counts belong to), but it is token-shaped, so it is kept out of the
// repo where the secret scanner would flag it. Unset, nothing reports.
//
// Only the production site on its real hostname reports, so local development,
// `vite preview` and a workers.dev test deploy never count as page views.
// "spa": true makes the beacon count client-side route changes, since the app
// navigates without reloading the page.
// =============================================================================

import { useEffect } from 'react';

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
const TOKEN = import.meta.env.VITE_CF_ANALYTICS_TOKEN || '';
const PRODUCTION_HOST = 'cropbid.in';

export function PageAnalytics() {
  useEffect(() => {
    if (!TOKEN || !import.meta.env.PROD || window.location.hostname !== PRODUCTION_HOST) return;
    if (document.querySelector(`script[src="${BEACON_SRC}"]`)) return;

    const script = document.createElement('script');
    script.defer = true;
    script.src = BEACON_SRC;
    script.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN, spa: true }));
    document.body.appendChild(script);
  }, []);

  return null;
}
