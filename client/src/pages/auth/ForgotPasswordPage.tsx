// =============================================================================
// ForgotPasswordPage — Request a password reset link
// =============================================================================
// Public page. Takes an email, calls POST /auth/forgot-password, and shows the
// same confirmation whether or not the account exists (the API is deliberately
// enumeration-safe, so the UI must be too). The emailed link opens
// /reset-password?token=… where the user picks a new password.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/axios';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import toast from 'react-hot-toast';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!emailValid) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong — please try again');
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
          <Link to="/login">Sign in</Link>
          <Link to="/signup">Sign up</Link>
        </nav>
      </header>

      <div className="cb-auth-body">
        <div className="cb-auth-form-wrap">
          <div className="cb-auth-form">
            {sent ? (
              <>
                <div className="cb-eyebrow">Auth · check your inbox</div>
                <h1 className="cb-h2" style={{ marginTop: 14 }}>
                  Reset link<br />
                  <span className="cb-italic">on its way.</span>
                </h1>
                <p className="cb-body" style={{ marginTop: 14 }}>
                  If an account exists for <strong>{email}</strong>, we've emailed a link to
                  choose a new password. It expires in 1 hour.
                </p>
                <p className="cb-small" style={{ marginTop: 12 }}>
                  Nothing arriving? Check your spam folder, or try again with the email you
                  signed up with.
                </p>
                <div style={{ marginTop: 28 }}>
                  <Link to="/login">
                    <Button size="lg" className="cb-btn-lg" style={{ width: '100%' }}>
                      Back to sign in
                      <ArrowIcon />
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="cb-eyebrow">Auth · password reset</div>
                <h1 className="cb-h2" style={{ marginTop: 14 }}>
                  Forgot your<br />
                  <span className="cb-italic">password?</span>
                </h1>
                <p className="cb-body" style={{ marginTop: 14, marginBottom: 32 }}>
                  Enter your account email and we'll send you a single-use reset link.
                </p>

                <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched(true)}
                    error={touched && email && !emailValid ? 'Invalid email address' : undefined}
                    required
                    autoComplete="email"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    className="cb-btn-lg"
                    style={{ width: '100%' }}
                  >
                    Send reset link
                    <ArrowIcon />
                  </Button>
                </form>

                <p className="cb-small" style={{ marginTop: 28, textAlign: 'center' }}>
                  Remembered it?{' '}
                  <Link to="/login" style={{ color: 'var(--cb-ember)', fontWeight: 500, textDecoration: 'none' }}>
                    Sign in →
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        <aside className="cb-auth-rail">
          <div>
            <span className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.6)' }}>● account recovery</span>
            <h2 className="cb-h2" style={{ marginTop: 14, color: '#f4f1ea' }}>
              Locked out?<br />
              <span style={{ fontFamily: 'var(--cb-font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#e0cf9e' }}>
                Two minutes.
              </span>
            </h2>
          </div>

          <div className="cb-auth-rail-card" style={{ transform: 'rotate(-1.2deg)' }}>
            <div className="cb-eyebrow">How it works</div>
            <div className="sub" style={{ marginTop: 8 }}>
              We email you a single-use link · valid for 1 hour · your listings, bids and
              escrow stay exactly as you left them.
            </div>
          </div>

          <div className="cb-auth-rail-card" style={{ transform: 'rotate(1.4deg)', marginLeft: 32 }}>
            <div className="cb-eyebrow">Security</div>
            <div className="sub" style={{ marginTop: 8 }}>
              Resetting signs you out of every device — if someone else had your password,
              they're out too.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
