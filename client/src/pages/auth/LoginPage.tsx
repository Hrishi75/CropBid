// =============================================================================
// LoginPage — Phone-or-email + password sign-in
// =============================================================================
// Public page. Accepts the user's phone number (primary identifier) or email
// in one field, calls AuthContext.login(), then redirects to "/" (which
// RootRedirect sends to the role dashboard), with a marketing rail alongside.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import toast from 'react-hot-toast';
import { IDLE_MINUTES, takeLogoutReason } from '../../lib/idle';

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // If the idle watchdog (or an expired refresh token) landed the user here,
  // say so — an unexplained trip back to the login screen reads like a bug.
  // takeLogoutReason() is single-use, so this shows once.
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
      await login(identifier.trim(), password);
      toast.success(t('Welcome back'));
      navigate('/');
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
          <a href="/#how" className="cb-auth-nav-extra">{t('How it works')}</a>
          <a href="/#marketplace" className="cb-auth-nav-extra">{t('Marketplace')}</a>
          <Link to="/signup">{t('Sign up')}</Link>
          <LanguageSwitcher />
        </nav>
      </header>

      <div className="cb-auth-body">
        <div className="cb-auth-form-wrap">
          <div className="cb-auth-form">
            <div className="cb-eyebrow">{t('Auth · sign-in')}</div>
            <h1 className="cb-h2" style={{ marginTop: 14 }}>
              {t('Sign in to')}<br />
              <span className="cb-italic">{t('your agent.')}</span>
            </h1>
            <p className="cb-body" style={{ marginTop: 14, marginBottom: 32 }}>
              {t('Pick up where your agent left off.')}
            </p>

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label={t('Phone or email')}
                type="text"
                placeholder="+91-9876543210"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, identifier: true }))}
                error={getFieldError('identifier')}
                required
                autoComplete="username"
              />
              <div>
                <Input
                  label={t('Password')}
                  type="password"
                  placeholder={t('Enter your password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <Link
                    to="/forgot-password"
                    className="cb-small"
                    style={{ color: 'var(--cb-ember)', fontWeight: 500, textDecoration: 'none' }}
                  >
                    {t('Forgot password?')}
                  </Link>
                </div>
              </div>
              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!formValid && touched.email === true}
                className="cb-btn-lg"
                style={{ width: '100%' }}
              >
                {t('Sign in')}
                <ArrowIcon />
              </Button>
            </form>

            <p className="cb-small" style={{ marginTop: 28, textAlign: 'center' }}>
              {t('No account on CropBid?')}{' '}
              <Link to="/signup" style={{ color: 'var(--cb-ember)', fontWeight: 500, textDecoration: 'none' }}>
                {t('Sign up →')}
              </Link>
            </p>
          </div>
        </div>

        <aside className="cb-auth-rail">
          <div>
            <span className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.6)' }}>● welcome back</span>
            <h2 className="cb-h2" style={{ marginTop: 14, color: '#f4f1ea' }}>
              Your agent ran 4 negotiations<br />
              <span style={{ fontFamily: 'var(--cb-font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#e0cf9e' }}>overnight.</span>
            </h2>
          </div>

          <div className="cb-auth-rail-card" style={{ transform: 'rotate(-1.2deg)' }}>
            <div className="cb-eyebrow">Last auction · B-22841</div>
            <div className="v">+$17,400</div>
            <div className="sub">saved vs broker · 1.6% over benchmark</div>
          </div>

          <div className="cb-auth-rail-card" style={{ transform: 'rotate(1.4deg)', marginLeft: 32 }}>
            <div className="cb-eyebrow">Awaiting your call</div>
            <div className="v">3 bids</div>
            <div className="sub">Wheat HRW · Turmeric · Mustard</div>
          </div>

          <div className="cb-auth-rail-card" style={{ transform: 'rotate(-0.6deg)' }}>
            <div className="cb-eyebrow">Marketplace · live</div>
            <div className="v">247 lots</div>
            <div className="sub">clearing now · 20+ origin countries</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
