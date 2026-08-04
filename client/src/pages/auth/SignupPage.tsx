// =============================================================================
// SignupPage — Create a farmer or buyer account
// =============================================================================
// Public page. Collects name/phone/password, role, country (which fixes the
// account currency), and email. Phone is the primary contact and login
// identifier — always required; email is required for buyers and optional for
// farmers (the server enforces the same split). Enforces live password
// rules before calling AuthContext.signup(), then routes to /onboarding to
// finish the profile. The right-hand rail swaps copy based on the chosen role.
//
// BUYERS TAKE A SECOND STEP. Their submit does not create an account: the
// server parks the details and emails a 6-digit code, and this page swaps to
// the code entry step. Nothing exists server-side until that code comes back,
// so abandoning here leaves no half-made account — and the email the buyer
// typed is not reserved, which is what stops one person's typo locking a
// stranger out of their own address.
// =============================================================================

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { PendingSignup } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import toast from 'react-hot-toast';
import type { Currency } from '../../types';

type SignupRole = 'FARMER' | 'BUYER';

// Matches SIGNUP_OTP_RESEND_COOLDOWN_MS on the server. The server is the one
// that enforces it — this only keeps the button from offering a request that
// would come back 429.
const RESEND_COOLDOWN_SECONDS = 60;

const COUNTRIES = [
  { code: 'India', label: 'India', currency: 'INR' as Currency, phonePlaceholder: '+91-9876543210' },
  { code: 'United States', label: 'United States', currency: 'USD' as Currency, phonePlaceholder: '+1-555-0123' },
  { code: 'United Kingdom', label: 'United Kingdom', currency: 'GBP' as Currency, phonePlaceholder: '+44-7911-123456' },
  { code: 'Germany', label: 'Germany', currency: 'EUR' as Currency, phonePlaceholder: '+49-151-12345678' },
  { code: 'France', label: 'France', currency: 'EUR' as Currency, phonePlaceholder: '+33-6-12-34-56-78' },
  { code: 'Netherlands', label: 'Netherlands', currency: 'EUR' as Currency, phonePlaceholder: '+31-6-12345678' },
  { code: 'Brazil', label: 'Brazil', currency: 'USD' as Currency, phonePlaceholder: '+55-11-91234-5678' },
  { code: 'Kenya', label: 'Kenya', currency: 'USD' as Currency, phonePlaceholder: '+254-712-345678' },
  { code: 'Nigeria', label: 'Nigeria', currency: 'USD' as Currency, phonePlaceholder: '+234-801-234-5678' },
  { code: 'Australia', label: 'Australia', currency: 'USD' as Currency, phonePlaceholder: '+61-412-345-678' },
  { code: 'UAE', label: 'United Arab Emirates', currency: 'USD' as Currency, phonePlaceholder: '+971-50-123-4567' },
  { code: 'Thailand', label: 'Thailand', currency: 'USD' as Currency, phonePlaceholder: '+66-81-234-5678' },
  { code: 'Vietnam', label: 'Vietnam', currency: 'USD' as Currency, phonePlaceholder: '+84-91-234-56-78' },
  { code: 'Indonesia', label: 'Indonesia', currency: 'USD' as Currency, phonePlaceholder: '+62-812-3456-7890' },
  { code: 'Ethiopia', label: 'Ethiopia', currency: 'USD' as Currency, phonePlaceholder: '+251-91-123-4567' },
];

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <div
      className="cb-mono"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: met ? 'var(--cb-sage)' : 'var(--cb-ink-3)',
      }}
    >
      <span>{met ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  );
}

// Step 2 for buyers: type the code from the inbox.
//
// One input rather than six boxes — pasting works without per-box splitting
// logic, screen readers get a single labelled field, and Android autofill from
// the notification lands in it correctly.
function VerifyStep({
  pending,
  onBack,
}: {
  pending: PendingSignup;
  onBack: () => void;
}) {
  const { verifySignupOtp, resendSignupOtp } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const codeValid = /^[0-9]{6}$/.test(code);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!codeValid) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setVerifying(true);
    setError(undefined);
    try {
      await verifySignupOtp(pending.pendingId, code);
      toast.success('Email verified. Complete your profile.');
      navigate('/onboarding');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Could not verify that code';
      setError(message);
      // The server counts attempts and ends the flow after five. When it says
      // so, drop back to the form rather than leaving a dead box on screen.
      if (/start again/i.test(message)) {
        toast.error(message);
        onBack();
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(undefined);
    try {
      await resendSignupOtp(pending.pendingId);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode('');
      toast.success(`New code sent to ${pending.email}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not send another code');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="cb-auth-form">
      <div className="cb-eyebrow">Auth · verify email</div>
      <h1 className="cb-h2" style={{ marginTop: 14 }}>
        Check your inbox<br />
        <span className="cb-italic">for a 6-digit code.</span>
      </h1>
      <p className="cb-body" style={{ marginTop: 14, marginBottom: 28 }}>
        We sent it to <strong>{pending.email}</strong>. It expires in 10 minutes.
      </p>

      <form onSubmit={handleVerify} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          value={code}
          // Strip everything but digits so a pasted "483 920" still fits, and
          // the field can never hold something the server will reject outright.
          onChange={(e) => {
            setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6));
            setError(undefined);
          }}
          error={error}
          required
          autoFocus
          style={{ fontSize: 24, letterSpacing: 10, textAlign: 'center', fontFamily: 'var(--cb-font-mono)' }}
        />

        <Button
          type="submit"
          size="lg"
          loading={verifying}
          disabled={!codeValid}
          style={{ width: '100%' }}
        >
          Verify and continue
          <ArrowIcon />
        </Button>
      </form>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="cb-small"
          style={{
            background: 'none', border: 'none', padding: 0,
            color: cooldown > 0 ? 'var(--cb-ink-3)' : 'var(--cb-ember)',
            fontWeight: 500,
            cursor: cooldown > 0 ? 'default' : 'pointer',
          }}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send another code'}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="cb-small"
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--cb-ink-3)', cursor: 'pointer',
          }}
        >
          ← Use a different email
        </button>
      </div>
    </div>
  );
}

export function SignupPage() {
  const { signup } = useAuth();
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRole>('FARMER');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Set once a buyer's details are parked server-side; its presence is what
  // swaps this page to the code entry step.
  const [pending, setPending] = useState<PendingSignup | null>(null);

  const selectedCountry = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];

  const passwordRules = useMemo(() => ({
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  }), [password]);

  const passwordValid = passwordRules.length && passwordRules.upper && passwordRules.lower && passwordRules.number;
  // Phone is the required primary contact; email is optional but must be
  // valid when provided. Digits are counted on the separator-stripped value
  // (mirrors the server): "+      " looks long enough but carries no number.
  const phoneValid =
    /^[+0-9][0-9\s\-()]*$/.test(phone.trim()) &&
    phone.trim().length <= 20 &&
    phone.replace(/[^0-9]/g, '').length >= 7;
  // Buyers must give an email; for farmers it stays optional but still has to
  // be well-formed when filled in.
  const emailRequired = role === 'BUYER';
  const emailValid = email.trim() === ''
    ? !emailRequired
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const nameValid = name.trim().length >= 2;
  const formValid = nameValid && phoneValid && emailValid && passwordValid;

  function getFieldError(field: string): string | undefined {
    if (!touched[field]) return undefined;
    if (field === 'name' && !nameValid) return 'Name must be at least 2 characters';
    if (field === 'phone' && !phoneValid) return 'Enter a valid phone number';
    if (field === 'email' && !emailValid) {
      return emailRequired && email.trim() === ''
        ? 'Email is required for buyer accounts'
        : 'Invalid email address';
    }
    if (field === 'password' && password && !passwordValid) return 'Password does not meet requirements';
    return undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, phone: true, email: true, password: true });
    if (!formValid) {
      toast.error('Please fix the errors above');
      return;
    }
    setLoading(true);
    try {
      const result = await signup({
        name, password, role, phone,
        email: email.trim() || undefined,
        country,
        currency: selectedCountry.currency,
        // Whatever they picked in the switcher before signing up. Carrying it
        // over means a Hindi speaker's account starts in Hindi instead of
        // defaulting to EN and having to set it again.
        language: i18n.language.slice(0, 2).toUpperCase(),
      });

      // Buyers: no account yet, just a code in their inbox.
      if (result.status === 'verification-required') {
        setPending(result.pending);
        toast.success(`Code sent to ${result.pending.email}`);
        return;
      }

      toast.success('Account created. Complete your profile.');
      navigate('/onboarding');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  const isFarmer = role === 'FARMER';

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
          <Link to="/login">Sign in</Link>
        </nav>
      </header>

      <div className="cb-auth-body">
        <div className="cb-auth-form-wrap">
          {pending ? (
            // Going back keeps everything the buyer typed, so "use a different
            // email" means editing one field, not filling the form again.
            <VerifyStep pending={pending} onBack={() => setPending(null)} />
          ) : (
          <div className="cb-auth-form">
            <div className="cb-eyebrow">Auth · create account</div>
            <h1 className="cb-h2" style={{ marginTop: 14 }}>
              Deploy your agent<br />
              <span className="cb-italic">in 60 seconds.</span>
            </h1>
            <p className="cb-body" style={{ marginTop: 14, marginBottom: 28 }}>
              Pick a role. Brief your agent. Run auctions while you sleep.
            </p>

            <div role="radiogroup" aria-label="Account type" style={{ marginBottom: 24 }}>
              <div className="cb-label">I'm a</div>
              <div className="cb-pill-group">
                {(['FARMER', 'BUYER'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => setRole(r)}
                    className={`cb-pill ${role === r ? 'active' : ''}`}
                  >
                    {r === 'FARMER' ? 'Farmer' : 'Buyer'}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input
                label="Full name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                error={getFieldError('name')}
                required
              />

              <div>
                <label htmlFor="country-select" className="cb-label">Country</label>
                <select
                  id="country-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="cb-input"
                  required
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <p className="cb-field-hint">Currency: {selectedCountry.currency}</p>
              </div>

              <Input
                label="Phone"
                type="tel"
                placeholder={selectedCountry.phonePlaceholder}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                error={getFieldError('phone')}
                required
                autoComplete="tel"
              />

              <Input
                label={emailRequired ? 'Email' : 'Email (optional)'}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={getFieldError('email')}
                required={emailRequired}
                autoComplete="email"
              />

              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  error={getFieldError('password')}
                  required
                  autoComplete="new-password"
                  aria-describedby="password-rules"
                />
                {password.length > 0 && (
                  <div
                    id="password-rules"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}
                  >
                    <PasswordRule met={passwordRules.length} label="8+ characters" />
                    <PasswordRule met={passwordRules.upper} label="Uppercase letter" />
                    <PasswordRule met={passwordRules.lower} label="Lowercase letter" />
                    <PasswordRule met={passwordRules.number} label="Number" />
                  </div>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!formValid && Object.keys(touched).length > 0}
                style={{ width: '100%' }}
              >
                Create account
                <ArrowIcon />
              </Button>
            </form>

            <p className="cb-small" style={{ marginTop: 24, textAlign: 'center' }}>
              Already on CropBid?{' '}
              <Link to="/login" style={{ color: 'var(--cb-ember)', fontWeight: 500, textDecoration: 'none' }}>
                Sign in →
              </Link>
            </p>
          </div>
          )}
        </div>

        <aside className="cb-auth-rail">
          {isFarmer ? (
            <>
              <div>
                <span className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.6)' }}>● for farmers</span>
                <h2 className="cb-h2" style={{ marginTop: 14, color: '#f4f1ea' }}>
                  Your agent lists, negotiates,<br />
                  <span style={{ fontFamily: 'var(--cb-font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#e0cf9e' }}>and closes.</span>
                </h2>
              </div>
              <div className="cb-auth-rail-card" style={{ transform: 'rotate(-1deg)' }}>
                <div className="cb-eyebrow">"I'm a Farmer"</div>
                <div className="v">Your agent:</div>
                <div className="sub">
                  · Lists crops globally<br />
                  · Runs counter negotiations<br />
                  · Settles deals on-platform
                </div>
              </div>
              <div className="cb-auth-rail-card" style={{ transform: 'rotate(1.2deg)', marginLeft: 32 }}>
                <div className="cb-eyebrow">Live · growers onboarded</div>
                <div className="v">14,247</div>
                <div className="sub">+312 today · 23 countries</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.6)' }}>● for buyers</span>
                <h2 className="cb-h2" style={{ marginTop: 14, color: '#f4f1ea' }}>
                  Stop calling brokers.<br />
                  <span style={{ fontFamily: 'var(--cb-font-serif)', fontStyle: 'italic', fontWeight: 400, color: '#e0cf9e' }}>Run auctions.</span>
                </h2>
              </div>
              <div className="cb-auth-rail-card" style={{ transform: 'rotate(-1deg)' }}>
                <div className="cb-eyebrow">"I'm a Buyer"</div>
                <div className="v">Your agent:</div>
                <div className="sub">
                  · Finds verified growers<br />
                  · Negotiates inside your guardrails<br />
                  · Closes forward contracts
                </div>
              </div>
              <div className="cb-auth-rail-card" style={{ transform: 'rotate(1.2deg)', marginLeft: 32 }}>
                <div className="cb-eyebrow">Live · savings vs broker</div>
                <div className="v">+1.6%</div>
                <div className="sub">avg price improvement · 14× faster bind</div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
