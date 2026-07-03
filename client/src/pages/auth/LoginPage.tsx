// =============================================================================
// LoginPage — Email/password sign-in
// =============================================================================
// Public page. Validates the email locally, calls AuthContext.login(), then
// redirects to "/" (which RootRedirect sends to the role dashboard). Includes
// one-tap "Quick login" chips for the seeded demo accounts and a marketing rail.
// =============================================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import toast from 'react-hot-toast';

const QUICK_ACCOUNTS = [
  { label: 'Farmer', email: 'rajesh@cropbid.test' },
  { label: 'Buyer', email: 'vikram@cropbid.test' },
  { label: 'Admin', email: 'admin@cropbid.test' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const formValid = emailValid && password.length > 0;

  function getFieldError(field: string): string | undefined {
    if (!touched[field]) return undefined;
    if (field === 'email' && email && !emailValid) return 'Invalid email address';
    return undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!formValid) return;
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Login failed');
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
          <a href="/#how">How it works</a>
          <a href="/#marketplace">Marketplace</a>
          <Link to="/signup">Sign up</Link>
        </nav>
      </header>

      <div className="cb-auth-body">
        <div className="cb-auth-form-wrap">
          <div className="cb-auth-form">
            <div className="cb-eyebrow">Auth · sign-in</div>
            <h1 className="cb-h2" style={{ marginTop: 14 }}>
              Sign in to<br />
              <span className="cb-italic">your agent.</span>
            </h1>
            <p className="cb-body" style={{ marginTop: 14, marginBottom: 32 }}>
              Pick up where your agent left off.
            </p>

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={getFieldError('email')}
                required
                autoComplete="email"
              />
              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter your password"
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
                    Forgot password?
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
                Sign in
                <ArrowIcon />
              </Button>
            </form>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Quick login · test accounts</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {QUICK_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    className="cb-chip"
                    style={{ cursor: 'pointer', justifyContent: 'center', padding: '6px 10px' }}
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword('password123');
                    }}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="cb-small" style={{ marginTop: 28, textAlign: 'center' }}>
              No account on CropBid?{' '}
              <Link to="/signup" style={{ color: 'var(--cb-ember)', fontWeight: 500, textDecoration: 'none' }}>
                Request a buyer agent →
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
