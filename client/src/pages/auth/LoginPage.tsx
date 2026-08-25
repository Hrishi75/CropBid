// =============================================================================
// LoginPage — a landing spot for /login, not a form
// =============================================================================
// Signing in happens in a modal over whatever page you were on (see
// components/auth/AuthModal.tsx), so this route mostly exists for the people
// who still arrive at the URL: a bookmark, an old link, a session that timed
// out. It drops them on the storefront with the sign-in window already open,
// which is the same place the header button would have taken them.
//
// THE PASSWORD ESCAPE HATCH: /login?password=1 still renders the old
// phone-or-email + password form. New accounts never get a password, but
// accounts that already have one do — admins created by prisma/createAdmin.ts
// most of all — and they need a door that does not depend on an SMS provider
// being configured and reachable.
//
// This URL is no longer the only way to that door. The same form is a toggle
// inside AuthModal now ("Use a password instead"), which is where people will
// actually find it; the header button opens the dialog, not this route. Keep
// this page anyway: it is the one password form that still works when the
// modal cannot mount, and an old bookmark should not break.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import toast from 'react-hot-toast';
import { IDLE_MINUTES, takeLogoutReason } from '../../lib/idle';
import { isPendingPartner } from '../../utils/partner';
import { AuthHandoffPanel } from '../../components/auth/AuthHandoffPanel';

export function LoginPage() {
  const [params] = useSearchParams();
  const usePassword = params.get('password') === '1';

  return usePassword ? <PasswordLogin /> : <ModalHandoff />;
}

// ---------------------------------------------------------------------------
// The default: bounce to the shop with the sign-in window open
// ---------------------------------------------------------------------------
function ModalHandoff() {
  const { openAuth } = useAuthModal();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    // The idle watchdog (or an expired refresh token) may have landed them
    // here — an unexplained trip back to a sign-in prompt reads like a bug.
    // takeLogoutReason() is single-use, so this shows once.
    if (takeLogoutReason() === 'idle') {
      toast(t('Signed out after {{minutes}} minutes of inactivity.', { minutes: IDLE_MINUTES }));
    }
    // replace, not push: Back should leave the site rather than bouncing
    // through this shim again.
    navigate('/', { replace: true });
    openAuth();
  }, [navigate, openAuth, t]);

  return <AuthHandoffPanel message="Opening the sign-in window…" />;
}

// ---------------------------------------------------------------------------
// The escape hatch: password sign-in for accounts that have one
// ---------------------------------------------------------------------------
function PasswordLogin() {
  const { login } = useAuth();
  const { openAuth } = useAuthModal();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (takeLogoutReason() === 'idle') {
      toast(t('Signed out after {{minutes}} minutes of inactivity.', { minutes: IDLE_MINUTES }));
    }
  }, [t]);

  const identifierValid = identifier.trim().length > 0;
  const formValid = identifierValid && password.length > 0;

  function getFieldError(field: string): string | undefined {
    if (!touched[field]) return undefined;
    if (field === 'identifier' && !identifierValid) return 'Enter your phone number or email';
    return undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ identifier: true, password: true });
    if (!formValid) return;
    setLoading(true);
    try {
      const loggedIn = await login(identifier.trim(), password);
      toast.success(t('Welcome back'));
      // Partners route by where their application stands: no application yet
      // → the form; waiting/sent back → the status page. Everyone else (and
      // approved partners) → the storefront, same as always.
      const isPartnerRole = loggedIn.role === 'FARMER' || loggedIn.role === 'BUYER';
      const hasApplication = !!(loggedIn.farmerProfile || loggedIn.buyerProfile);
      navigate(
        isPendingPartner(loggedIn) ? '/partner/status'
        : isPartnerRole && !hasApplication ? '/onboarding'
        : '/'
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Login failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cb-app cb-auth">
      <header className="cb-auth-nav">
        <Link to="/" className="wordmark">
          <ArcMark size={22} />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="cb-auth-nav-links">
          <LanguageSwitcher />
          <Link to="/partner">Become a partner</Link>
        </nav>
      </header>

      <div className="cb-auth-body">
        <div className="cb-auth-form-wrap">
          <div className="cb-auth-form">
            <div className="cb-eyebrow">Auth · password sign-in</div>
            <h1 className="cb-h2" style={{ marginTop: 14 }}>
              Sign in with<br /><span className="cb-italic">your password.</span>
            </h1>
            <p className="cb-body" style={{ marginTop: 14, marginBottom: 28 }}>
              For accounts that were set up with one. Everyone else signs in with
              a code sent to their phone.
            </p>

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="Phone or email"
                placeholder="+91-9876543210"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, identifier: true }))}
                error={getFieldError('identifier')}
                autoComplete="username"
                required
                autoFocus
              />
              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((s) => ({ ...s, password: true }))}
                  autoComplete="current-password"
                  required
                />
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                  <Link to="/forgot-password" className="cb-small" style={{ color: 'var(--cb-ink-3)', textDecoration: 'none' }}>
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button type="submit" size="lg" loading={loading} style={{ width: '100%' }}>
                Sign in
                <ArrowIcon />
              </Button>
            </form>

            <p className="cb-small" style={{ marginTop: 24, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => openAuth()}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--cb-ember)', fontWeight: 500, cursor: 'pointer', font: 'inherit' }}
              >
                Sign in with a code instead →
              </button>
            </p>
          </div>
        </div>

        <aside className="cb-auth-rail">
          <div>
            <span className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.6)' }}>● welcome back</span>
            <h2 className="cb-h2" style={{ marginTop: 14, color: '#f4f1ea' }}>
              The market<br />
              <span style={{ fontFamily: 'var(--cb-font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#e0cf9e' }}>kept running.</span>
            </h2>
          </div>
          <div className="cb-auth-rail-card" style={{ transform: 'rotate(-1deg)' }}>
            <div className="cb-eyebrow">Since you were away</div>
            <div className="v">Bids, offers, orders</div>
            <div className="sub">waiting on your dashboard</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
