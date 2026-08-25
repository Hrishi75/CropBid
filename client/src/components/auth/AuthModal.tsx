// =============================================================================
// AuthModal — the floating sign-in window
// =============================================================================
// The whole front door, in an overlay. Nobody navigates to a sign-in page any
// more: the header opens this over whatever the person was already looking at,
// and closing it puts them back exactly where they were — mid-scroll, mid-cart,
// nothing lost. That is the point. A shopper who has to leave the shelf to
// sign in often does not come back.
//
// TWO STEPS, NO PASSWORD:
//   1. Phone number  → a 6-digit code goes out, over WhatsApp where possible
//   2. Code (+ name, for a number we have never seen) → signed in
// There is no signup/sign-in distinction because to the person typing there
// isn't one: the code proves the number and the account is found or created.
//
// THE EMAIL RESCUE. WhatsApp does not reach everyone — no WhatsApp on the
// number, Meta's unverified 250/day cap, an outage. When the server exhausts
// its channels and has no address on file it answers NEEDS_EMAIL, and this
// dialog grows an email field instead of dead-ending. Which channel actually
// carried the code comes back with the challenge, so step 2 names the right
// place to look rather than guessing.
//
// THE SIDE PANEL is not decoration. Most people opening this are shoppers, so
// the phone box owns the main column. The two other audiences — people who
// want to SELL, and businesses buying at volume — get a standing invitation
// beside it rather than a role question everyone else has to answer first.
//
// Both panels stack on mobile, phone box first.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { OtpChannel, PhoneChallenge, PhoneSignInRole } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ArcMark, ArrowIcon } from '../ui/Brand';
import { isPendingPartner } from '../../utils/partner';
import toast from 'react-hot-toast';

// Mirrors PHONE_OTP_RESEND_COOLDOWN_MS on the server. The server enforces it —
// this only stops the button offering a request that would come back 429.
const RESEND_COOLDOWN_SECONDS = 30;

export interface AuthModalOptions {
  /** Role to create if the number is new. Set by the partner/business doors. */
  intendedRole?: PhoneSignInRole;
  /** Where to go after a successful sign-in. Defaults to staying put. */
  redirectTo?: string;
  /** Headline override, so the partner door can say why it opened. */
  title?: ReactNode;
}

interface AuthModalProps extends AuthModalOptions {
  open: boolean;
  onClose: () => void;
}

// Step 2 copy, per channel. "Check your phone" is wrong — and quietly
// infuriating — when the code went to an inbox because WhatsApp failed.
const CHANNEL_COPY: Record<OtpChannel, { heading: ReactNode; where: string }> = {
  whatsapp: { heading: <>Check WhatsApp<br /><span className="cb-italic">for a 6-digit code.</span></>, where: 'WhatsApp' },
  sms:      { heading: <>Check your phone<br /><span className="cb-italic">for a 6-digit code.</span></>, where: 'SMS' },
  email:    { heading: <>Check your email<br /><span className="cb-italic">for a 6-digit code.</span></>, where: 'email' },
  // Local development with no channel configured — the code is in the server
  // log. Saying so beats sending someone to look at a phone that never buzzed.
  console:  { heading: <>Check the server log<br /><span className="cb-italic">for a 6-digit code.</span></>, where: 'the server log' },
};

// The two standing invitations in the side panel.
const SIDE_DOORS = [
  {
    href: '/partner',
    eyebrow: 'Sell on CropBid',
    title: 'Become a partner',
    body: 'Farmers, local shops and wholesalers — list your stock at your own rates and reach buyers near you.',
  },
  {
    href: '/partner#buy',
    eyebrow: 'Buying at volume',
    title: 'Open a business account',
    body: 'Restaurants, cafés and food businesses — source direct, skip the middlemen, order on repeat.',
  },
];

export function AuthModal({ open, onClose, intendedRole, redirectTo, title }: AuthModalProps) {
  const { startPhoneSignIn, verifyPhoneSignIn } = useAuth();
  const navigate = useNavigate();

  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // Only shown after the server says it couldn't reach the number.
  const [email, setEmail] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string>();

  const dialogRef = useRef<HTMLDivElement>(null);

  // Every open starts clean. Leaving a half-typed number and a dead challenge
  // behind would show the next person a code box for an SMS they never got.
  useEffect(() => {
    if (open) {
      setChallenge(null); setPhone(''); setCode(''); setName('');
      setEmail(''); setNeedsEmail(false);
      setError(undefined); setCooldown(0);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Escape closes, and the page behind must not scroll while the overlay is up
  // — otherwise a flick on mobile scrolls the shelf under the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const phoneValid = /^[+0-9][0-9\s\-()]*$/.test(phone.trim()) && phoneDigits.length >= 7 && phone.trim().length <= 20;
  const codeValid = /^[0-9]{6}$/.test(code);
  const emailValid = !needsEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const needsName = Boolean(challenge?.isNewAccount);
  const nameValid = !needsName || name.trim().length >= 2;

  async function handleSendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phoneValid) { setError('Enter a valid phone number'); return; }
    if (!emailValid) { setError('Enter a valid email address'); return; }
    setSending(true); setError(undefined);
    try {
      const ch = await startPhoneSignIn(
        phone.trim(), intendedRole, needsEmail ? email.trim() : undefined,
      );
      setChallenge(ch);
      setNeedsEmail(false);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(`Code sent to ${ch.sentTo}`);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Could not send a code just now';
      setError(message);
      // The one failure the person can fix themselves: we couldn't reach their
      // WhatsApp and hold no address for them. Grow an email field rather than
      // leaving them at a dead end.
      if (err.response?.data?.code === 'NEEDS_EMAIL') setNeedsEmail(true);
      else toast.error(message);
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    if (!codeValid) { setError('Enter the 6-digit code we sent you'); return; }
    if (!nameValid) { setError('Tell us your name to finish'); return; }

    setVerifying(true); setError(undefined);
    try {
      const { user, created } = await verifyPhoneSignIn(
        challenge.challengeId, code, needsName ? name.trim() : undefined,
      );
      toast.success(created ? `Welcome to CropBid, ${user.name.split(' ')[0]}` : 'Welcome back');
      onClose();

      // A brand-new partner has an application to fill in; a partner mid-review
      // has a status page. Everyone else stays exactly where they were, which
      // is the whole reason this is a modal and not a page.
      if (isPendingPartner(user)) navigate('/partner/status');
      else if ((user.role === 'FARMER' || user.role === 'BUYER') && !user.farmerProfile && !user.buyerProfile) navigate('/onboarding');
      else if (redirectTo) navigate(redirectTo);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Could not verify that code';
      setError(message);
      // The server ends the challenge after three wrong codes or on expiry.
      // When it says so, drop back to the number step rather than leaving a
      // dead box on screen.
      if (/start again|expired/i.test(message)) {
        toast.error(message);
        setChallenge(null); setCode('');
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    // cb-app is not decoration here: the design tokens (--cb-paper, --cb-ink,
    // …) and every atom class (cb-btn, cb-card, cb-eyebrow) are SCOPED to
    // .cb-app / .cb-landing rather than :root. This dialog mounts at the app
    // root, outside both, so without it the modal renders unstyled — no
    // background, no type scale. .cb-modal-backdrop overrides the opaque page
    // background that comes with it.
    <div
      className="cb-app cb-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="cb-modal cb-auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cb-auth-modal-title"
        ref={dialogRef}
      >
        <button type="button" className="cb-modal-close" onClick={onClose} aria-label="Close">×</button>

        {/* ---------------- Main column: the phone box ---------------- */}
        <div className="cb-auth-modal-main">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
            <ArcMark size={20} />
            <span style={{ fontWeight: 500, letterSpacing: '-0.01em' }}>CropBid</span>
          </div>

          {!challenge ? (
            <>
              <h2 id="cb-auth-modal-title" className="cb-h3" style={{ margin: 0 }}>
                {title || <>Enter your number<br /><span className="cb-italic">to continue.</span></>}
              </h2>
              <p className="cb-small" style={{ marginTop: 10, marginBottom: 22 }}>
                {needsEmail
                  ? "We couldn't reach that number on WhatsApp. Add an email and we'll send the code there."
                  : "We'll send a 6-digit code to your WhatsApp. No password to remember."}
              </p>

              <form onSubmit={handleSendCode} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Phone number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91-9876543210"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(undefined); }}
                  error={error}
                  autoFocus
                  required
                />
                {/* Appears only when WhatsApp couldn't reach the number. */}
                {needsEmail && (
                  <Input
                    label="Email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(undefined); }}
                    required
                    autoFocus
                  />
                )}
                <Button
                  type="submit"
                  size="lg"
                  loading={sending}
                  disabled={!phoneValid || !emailValid}
                  style={{ width: '100%' }}
                >
                  {needsEmail ? 'Email me the code' : 'Send code'}
                  <ArrowIcon />
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 id="cb-auth-modal-title" className="cb-h3" style={{ margin: 0 }}>
                {(CHANNEL_COPY[challenge.channel] ?? CHANNEL_COPY.whatsapp).heading}
              </h2>
              <p className="cb-small" style={{ marginTop: 10, marginBottom: 22 }}>
                Sent on {(CHANNEL_COPY[challenge.channel] ?? CHANNEL_COPY.whatsapp).where}{' '}
                to <strong>{challenge.sentTo}</strong>.{' '}
                <button
                  type="button"
                  onClick={() => { setChallenge(null); setCode(''); setError(undefined); }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--cb-ember)', fontWeight: 500, cursor: 'pointer', font: 'inherit' }}
                >
                  Change
                </button>
              </p>

              <form onSubmit={handleVerify} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  // Digits only, so a pasted "508 551" still fits and the field
                  // can never hold something the server will reject outright.
                  onChange={(e) => { setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); setError(undefined); }}
                  error={needsName ? undefined : error}
                  autoFocus
                  required
                  style={{ fontSize: 24, letterSpacing: 10, textAlign: 'center', fontFamily: 'var(--cb-font-mono)' }}
                />

                {/* Asked on the same step, not a third one: the server keeps
                    the code alive if only the name is missing, but making
                    someone type six digits twice is a needless stumble. */}
                {needsName && (
                  <Input
                    label="Your name"
                    placeholder="What should we call you?"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(undefined); }}
                    error={error}
                    required
                  />
                )}

                <Button
                  type="submit"
                  size="lg"
                  loading={verifying}
                  disabled={!codeValid || !nameValid}
                  style={{ width: '100%' }}
                >
                  {needsName ? 'Create my account' : 'Sign in'}
                  <ArrowIcon />
                </Button>
              </form>

              <button
                type="button"
                onClick={() => handleSendCode()}
                disabled={cooldown > 0 || sending}
                className="cb-small"
                style={{
                  marginTop: 16, background: 'none', border: 'none', padding: 0,
                  color: cooldown > 0 ? 'var(--cb-ink-3)' : 'var(--cb-ember)',
                  fontWeight: 500, cursor: cooldown > 0 ? 'default' : 'pointer',
                  alignSelf: 'center',
                }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send another code'}
              </button>
            </>
          )}

          <p className="cb-tiny" style={{ marginTop: 22, color: 'var(--cb-ink-3)' }}>
            By continuing you agree to our{' '}
            <a href="/privacy" style={{ color: 'var(--cb-ink-2)' }}>privacy policy</a>.
          </p>
        </div>

        {/* ---------------- Side panel: the other two audiences ---------------- */}
        <aside className="cb-auth-modal-side">
          <div className="cb-auth-modal-side-head">Not just shopping?</div>
          {SIDE_DOORS.map((d) => (
            <a
              key={d.href}
              href={d.href}
              className="cb-auth-modal-door"
              onClick={onClose}
            >
              <div className="cb-eyebrow">{d.eyebrow}</div>
              <div className="cb-auth-modal-door-title">
                {d.title}
                <ArrowIcon />
              </div>
              <p>{d.body}</p>
            </a>
          ))}
          <p className="cb-auth-modal-side-foot">
            Partner accounts are reviewed by our team — usually within 24–48 hours.
          </p>
        </aside>
      </div>
    </div>
  );
}
