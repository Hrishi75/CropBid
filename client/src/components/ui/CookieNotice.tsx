// =============================================================================
// CookieNotice — the one-time "here is what we store on your device" bar
// =============================================================================
// CropBid sets exactly ONE cookie: the httpOnly `refreshToken` that keeps a
// signed-in session alive (auth.controller.ts, REFRESH_COOKIE_OPTIONS). Nothing
// else. Vercel Analytics is cookie-free, and there is no ad or retargeting
// pixel anywhere in the app. The rest of what lives on a visitor's device is
// localStorage the site cannot work without: the basket, the delivery city, the
// chosen language, the idle-timeout clock.
//
// WHY A NOTICE AND NOT A CONSENT GATE:
// Accept/Reject buttons are a promise that rejecting turns something off. Here
// there is nothing to turn off, because nothing optional is being set. A pair
// of buttons where one does nothing is worse than no buttons at all: it is a
// consent theatre that also invites the visitor to break their own basket. So
// this states the facts, points at the policy, and goes away.
//
// If a tracking or advertising cookie is ever added, this component is NOT the
// thing to edit. That change needs real prior consent (DPDP Act notice-and-
// consent, and the EU rules for anyone reachable from there): opt-in by
// default-off, a genuine reject, and a way to change the answer later.
//
// It mounts OUTSIDE AppContent, next to Toaster and Analytics, for the reason
// given in App.tsx: it is a browser-only side effect with nothing to say to a
// crawler, so the prerender never renders it into the static markup.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// sessionStorage, NOT localStorage, and that is the whole design: every fresh
// visit gets told again. Dismissing it silences it for the rest of THAT visit,
// across every page they open, and the next visit starts clean. A permanent
// dismissal would mean someone who agreed to this months ago never sees it
// again even after what we store has changed underneath them.
//
// The cost is real and accepted: a regular shopper sees it once per visit
// rather than once ever. Two things keep that tolerable. Dismissing it lasts
// the whole visit, because the component is mounted once in App.tsx and never
// unmounts as they move around the site. And the card is small, corner-pinned
// and covers nothing they need.
const STORAGE_KEY = 'cb-cookie-notice';

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage blocked (private mode, locked-down browser), or no sessionStorage
    // at all because this module was loaded by the prerenderer. We cannot
    // remember a dismissal, and a card that will not stay shut is worse than
    // one that never showed, so stay quiet.
    return true;
  }
}

export function CookieNotice() {
  const { t } = useTranslation();

  // Read once, during the first render, rather than raised afterwards in an
  // effect: someone who dismissed it a minute ago and then hit reload should
  // never see it paint and then vanish. Safe to read storage this way because
  // the app mounts with createRoot, not hydrateRoot: the prerendered markup is
  // replaced outright, so there is no server render for this to disagree with.
  const [show, setShow] = useState(() => !alreadySeen());

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Nothing to do. The card is gone for this page; it comes back on the
      // next full load, which is the honest failure mode.
    }
  };

  return (
    <section className="cb-cookie" role="region" aria-label={t('Cookie notice')}>
      <div className="cb-cookie-body">
        <p className="cb-cookie-title">{t('Cookies and browser storage')}</p>
        <p className="cb-cookie-text">
          {t('We only use what the site needs to work: a cookie that keeps you signed in, plus your basket, delivery city and language saved in this browser. No advertising cookies and no tracking across other websites.')}{' '}
          <Link to="/privacy#cookies" className="cb-cookie-link">
            {t('Read the privacy policy')}
          </Link>
        </p>
      </div>
      <button type="button" className="cb-cookie-btn" onClick={dismiss}>
        {t('Got it')}
      </button>
    </section>
  );
}
