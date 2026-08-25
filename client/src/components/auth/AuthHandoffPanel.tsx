// =============================================================================
// AuthHandoffPanel — what /login and /signup render while they hand off
// =============================================================================
// Both routes now bounce to the storefront with the sign-in window open, but
// they cannot render nothing while doing it:
//   - the prerender build rejects an empty page (and would have shipped a
//     blank white document to anyone opening the URL with JS still loading)
//   - a bookmarked /login should look like an app waking up, not a broken tab
//
// So they render this: the wordmark, one line of explanation, and a manual
// way through in case the effect never fires (JS disabled, a hydration error).
// It is on screen for a frame or two in the normal case.
// =============================================================================

import { Link } from 'react-router-dom';
import { ArcMark } from '../ui/Brand';
import { SignInLink } from './SignInLink';

export function AuthHandoffPanel({ message }: { message: string }) {
  return (
    <div className="cb-app" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
          <ArcMark size={22} />
          <span style={{ fontWeight: 500, letterSpacing: '-0.01em' }}>CropBid</span>
        </div>
        <p className="cb-body" style={{ margin: 0 }}>{message}</p>
        <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <SignInLink className="cb-btn cb-btn-primary" label="Sign in" />
          <Link to="/" className="cb-btn cb-btn-ghost">Go to the shop</Link>
        </div>
      </div>
    </div>
  );
}
