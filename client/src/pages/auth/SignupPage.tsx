// =============================================================================
// SignupPage — a landing spot for /signup, not a form
// =============================================================================
// Creating an account happens in the sign-in window
// (components/auth/AuthModal.tsx), on its create-an-account lane. So this
// route puts you on the storefront with that window open on that lane, and
// exists so there is a plain URL to send a new person to.
//
// It also honours the partner querystring, so an older
// /signup?as=partner&role=FARMER&type=LOCAL_SHOP link still lands somebody in
// the right flow: they make a shopper's account, the application form opens
// next, and the subtype is parked for that form to pick up.
// =============================================================================

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthModal } from '../../context/AuthModalContext';
import type { PhoneSignInRole } from '../../context/AuthContext';
import { AuthHandoffPanel } from '../../components/auth/AuthHandoffPanel';

// OnboardingPage reads this to preselect the application subtype. Session-
// scoped on purpose: a different person on the same machine tomorrow should
// not inherit today's choice.
export const PARTNER_TYPE_KEY = 'cb-partner-type';

/**
 * Drop the parked subtype once the form has read it.
 *
 * A hint outranks the application already on file, so it has to be a record of
 * a fresh click and nothing more. Left behind, it would keep deciding which
 * form opens for the rest of the session.
 */
export function forgetPartnerType(): void {
  try {
    sessionStorage.removeItem(PARTNER_TYPE_KEY);
  } catch {
    // Same as below: storage disabled just means there was nothing parked.
  }
}

/** Park the partner subtype for the application form to pick up. */
export function rememberPartnerType(role: 'FARMER' | 'BUYER', type: string): void {
  try {
    sessionStorage.setItem(PARTNER_TYPE_KEY, `${role}:${type}`);
  } catch {
    // Private browsing with storage disabled — the form just opens on its
    // default subtype, which the applicant can change. Not worth failing over.
  }
}

export function SignupPage() {
  const [params] = useSearchParams();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  useEffect(() => {
    const isPartner = params.get('as') === 'partner';
    const role: PhoneSignInRole = params.get('role') === 'BUYER' ? 'BUYER'
      : params.get('role') === 'FARMER' ? 'FARMER'
      : 'CONSUMER';

    if (isPartner && role !== 'CONSUMER') {
      const type = params.get('type') || (role === 'BUYER' ? 'RESTAURANT' : 'FARMER');
      rememberPartnerType(role, type);
      navigate('/partner', { replace: true });
      openAuth({
        intendedRole: role,
        startWith: 'signup',
        title: <>Start your<br /><span className="cb-italic">application.</span></>,
      });
      return;
    }

    // replace, not push: Back should leave the site rather than bouncing
    // through this shim again.
    navigate('/', { replace: true });
    openAuth({ startWith: 'signup' });
  }, [params, navigate, openAuth]);

  return <AuthHandoffPanel message="Opening the sign-up window…" />;
}
