// =============================================================================
// ResetPasswordPage — Choose a new password via an emailed token
// =============================================================================
// Public page, opened from the reset email as /reset-password?token=…
// Validates the new password against the same policy the server enforces
// (8+ chars, upper, lower, digit), then calls POST /auth/reset-password.
// A missing/expired token gets a clear path back to /forgot-password.
// =============================================================================

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../lib/axios';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import toast from 'react-hot-toast';

// Mirror of the server-side password policy (auth.controller passwordSchema).
export function passwordPolicyError(password: string): string | undefined {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return undefined;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const passwordError = passwordPolicyError(password);
  const confirmError = confirm && confirm !== password ? 'Passwords do not match' : undefined;
  const formValid = !passwordError && password === confirm && confirm.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!formValid) return;
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      toast.success('Password updated — sign in with your new password');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not reset password — please try again');
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
            {!token ? (
              <>
                <div className="cb-eyebrow">Auth · invalid link</div>
                <h1 className="cb-h2" style={{ marginTop: 14 }}>
                  This link is<br />
                  <span className="cb-italic">incomplete.</span>
                </h1>
                <p className="cb-body" style={{ marginTop: 14 }}>
                  The reset link is missing its token — it may have been truncated by your
                  email client. Request a fresh one below.
                </p>
                <div style={{ marginTop: 28 }}>
                  <Link to="/forgot-password">
                    <Button size="lg" className="cb-btn-lg" style={{ width: '100%' }}>
                      Request a new link
                      <ArrowIcon />
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="cb-eyebrow">Auth · new password</div>
                <h1 className="cb-h2" style={{ marginTop: 14 }}>
                  Choose a new<br />
                  <span className="cb-italic">password.</span>
                </h1>
                <p className="cb-body" style={{ marginTop: 14, marginBottom: 32 }}>
                  8+ characters with an uppercase letter, a lowercase letter, and a number.
                </p>

                <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Input
                    label="New password"
                    type="password"
                    placeholder="Enter a new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    error={touched.password && password ? passwordError : undefined}
                    required
                    autoComplete="new-password"
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    placeholder="Repeat the new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                    error={touched.confirm ? confirmError : undefined}
                    required
                    autoComplete="new-password"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    className="cb-btn-lg"
                    style={{ width: '100%' }}
                  >
                    Set new password
                    <ArrowIcon />
                  </Button>
                </form>

                <p className="cb-small" style={{ marginTop: 28, textAlign: 'center' }}>
                  Link expired?{' '}
                  <Link to="/forgot-password" style={{ color: 'var(--cb-ember)', fontWeight: 500, textDecoration: 'none' }}>
                    Request a new one →
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        <aside className="cb-auth-rail">
          <div>
            <span className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.6)' }}>● almost there</span>
            <h2 className="cb-h2" style={{ marginTop: 14, color: '#f4f1ea' }}>
              One new password<br />
              <span style={{ fontFamily: 'var(--cb-font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#e0cf9e' }}>
                and you're back.
              </span>
            </h2>
          </div>

          <div className="cb-auth-rail-card" style={{ transform: 'rotate(-1.2deg)' }}>
            <div className="cb-eyebrow">Heads up</div>
            <div className="sub" style={{ marginTop: 8 }}>
              Setting a new password signs you out everywhere else. Your listings, bids and
              escrow are untouched.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
