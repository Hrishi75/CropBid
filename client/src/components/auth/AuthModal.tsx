// =============================================================================
// AuthModal — the floating sign-in window
// =============================================================================
// The whole front door, in an overlay. Nobody navigates to a sign-in page any
// more: the header opens this over whatever the person was already looking at,
// and closing it puts them back exactly where they were — mid-scroll, mid-cart,
// nothing lost. That is the point. A shopper who has to leave the shelf to
// sign in often does not come back.
//
// THREE LANES, ONE WINDOW. Switching between them costs nothing and none of
// them loses the page behind it.
//
//   Sign in (the default)  email or phone, and the password they chose
//   Create an account      name, email or phone, password, confirm password.
//                          No code: the account is made on the spot and they
//                          are signed in.
//
// Every lane makes a new account a SHOPPER, the partner doors included. The
// server does not take a role at all. Someone who came in to apply is sent to
// the application form once their account exists, and approval is what makes
// them a partner.
//   One-time code          phone → a 6-digit code over WhatsApp → signed in.
//                          Kept because accounts made through it before
//                          sign-up existed have no password and no other way
//                          in, and it is how a phone-only account gets back in
//                          after forgetting its password.
//
// Sign-up verifies nothing yet, by decision: phone verification is to be
// integrated later, and a new shopper should not wait on it. See CLAUDE.md
// section 4.
//
// THE EMAIL RESCUE. WhatsApp does not reach everyone — no WhatsApp on the
// number, Meta's unverified 250/day cap, an outage. When the server exhausts
// its channels and has no address on file it answers NEEDS_EMAIL, and this
// dialog grows an email field instead of dead-ending. Which channel actually
// carried the code comes back with the challenge, so step 2 names the right
// place to look rather than guessing.
//
// THE SIDE PANEL is not decoration. Most people opening this are shoppers, so
// the form owns the main column. The two other audiences — people who
// want to SELL, and businesses buying at volume — get a standing invitation
// beside it rather than a role question everyone else has to answer first.
//
// Both panels stack on mobile, form first.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { OtpChannel, PhoneChallenge } from '../../context/AuthContext';
import type { User } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ArcMark, ArrowIcon } from '../ui/Brand';
import { isPendingPartner } from '../../utils/partner';
import toast from 'react-hot-toast';

// Mirrors PHONE_OTP_RESEND_COOLDOWN_MS on the server. The server enforces it —
// this only stops the button offering a request that would come back 429.
const RESEND_COOLDOWN_SECONDS = 30;

export interface AuthModalOptions {
  /**
   * What they are applying to become, set by the partner and business doors.
   * It never decides the account's role: every new account is a shopper, and
   * a reviewer's approval is what grants the role. It decides where a NEW
   * account goes next, which is the application form.
   */
  intendedRole?: 'CONSUMER' | 'FARMER' | 'BUYER';
  /** Where to go after a successful sign-in. Defaults to staying put. */
  redirectTo?: string;
  /** Headline override for the lane the window opens on, saying why it opened. */
  title?: ReactNode;
  /** Which lane to open on. Sign-in unless the caller knows they are new. */
  startWith?: 'signin' | 'signup';
}

type Mode = 'password' | 'signup' | 'code';

// Mirrors passwordSchema in the server's auth.controller. The server enforces
// it; this is what lets the form say which rule is still unmet as they type.
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'an uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'a lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'a number', test: (p) => /[0-9]/.test(p) },
];

/**
 * Read the one "email or phone" box. Anything with an @ is an email address;
 * everything else has to be a phone number, counted on its digits the way the
 * server counts them, so "+  -  " cannot pass as one.
 */
function readContact(raw: string): { email?: string; phone?: string } | null {
  const value = raw.trim();
  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value } : null;
  }
  const digits = value.replace(/[^0-9]/g, '');
  return /^[+0-9][0-9\s\-()]*$/.test(value) && digits.length >= 7 && value.length <= 20
    ? { phone: value }
    : null;
}

type SignupField = 'name' | 'contact' | 'password' | 'confirm';

// The in-text links that move between lanes.
const LINK_BUTTON: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: 'var(--cb-ember)',
  fontWeight: 500, cursor: 'pointer', font: 'inherit',
};

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
    body: 'Restaurants, cafés and food businesses — source direct at listed prices, order on repeat.',
  },
];

export function AuthModal({ open, onClose, intendedRole, redirectTo, title, startWith }: AuthModalProps) {
  const { login, signup, startPhoneSignIn, verifyPhoneSignIn } = useAuth();
  const navigate = useNavigate();

  // Password sign-in is the default; see the header for the three lanes. The
  // lane it opened on is kept too, because a caller's title ("Applying as a
  // farmer") belongs to that lane and reads wrong over the other two.
  const openingMode: Mode = startWith === 'signup' ? 'signup' : 'password';
  const [mode, setMode] = useState<Mode>(openingMode);

  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [phone, setPhone] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // Only shown after the server says it couldn't reach the number.
  const [email, setEmail] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string>();
  // Create-an-account only. The error is shown under the field it is about,
  // rather than under the last box whatever went wrong.
  const [confirm, setConfirm] = useState('');
  const [errorField, setErrorField] = useState<SignupField>();

  const dialogRef = useRef<HTMLDivElement>(null);

  // Which "attempt" is currently on screen. A sign-in request outlives the
  // click that started it, and closing, reopening or switching lanes in that
  // window leaves a continuation holding a dialog that no longer exists. It
  // bumps on every one of those, and both submit handlers check it before they
  // touch the UI — otherwise an abandoned password attempt closes the dialog
  // somebody has since reopened, or navigates on a sign-in they walked away
  // from. The session itself still lands; it is only the UI that is stale.
  const attemptRef = useRef(0);

  // Every open starts clean. Leaving a half-typed number and a dead challenge
  // behind would show the next person a code box for an SMS they never got.
  useEffect(() => {
    // Bumped on BOTH transitions, not just opening. Closing mid-request is the
    // commonest way to abandon one, and leaving the counter untouched there let
    // the continuation sail through its guard and navigate someone who had
    // already walked away.
    attemptRef.current += 1;
    if (open) {
      setSending(false); setSigningIn(false); setVerifying(false);
      setMode(openingMode);
      setChallenge(null); setPhone(''); setCode(''); setName('');
      setEmail(''); setNeedsEmail(false);
      setIdentifier(''); setPassword(''); setConfirm('');
      setError(undefined); setErrorField(undefined); setCooldown(0);
    }
  // openingMode is derived from a prop that only changes together with `open`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const passwordFormValid = identifier.trim().length > 0 && password.length > 0;
  const unmetRules = PASSWORD_RULES.filter((r) => !r.test(password));
  const clearError = () => { setError(undefined); setErrorField(undefined); };

  // Where a freshly signed-in account lands, decided once for both lanes. A
  // brand-new partner has an application to fill in; a partner mid-review has
  // a status page. Everyone else stays exactly where they were, which is the
  // whole reason this is a modal and not a page.
  //
  // A partner door sends every SHOPPER on to the application, whether this
  // sign-in made their account or found an old one: either way they clicked
  // "Apply", and that is where they were going. It is what PartnerPage already
  // does for someone signed in when they click. The subtype they chose is
  // parked for the form to pick up. `created` covers create-an-account, which
  // hands back no user, and whose account can only be a new shopper's.
  function routeAfterAuth(user: User | null, created: boolean) {
    const applying = intendedRole && intendedRole !== 'CONSUMER';
    if (user && isPendingPartner(user)) navigate('/partner/status');
    else if (user && (user.role === 'FARMER' || user.role === 'BUYER') && !user.farmerProfile && !user.buyerProfile) navigate('/onboarding');
    else if (applying && (created || user?.role === 'CONSUMER')) navigate('/onboarding');
    else if (redirectTo) navigate(redirectTo);
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordFormValid) { setError('Enter your phone or email and your password'); return; }
    const attempt = attemptRef.current;
    setSigningIn(true); setError(undefined);
    try {
      const user = await login(identifier.trim(), password);
      if (attemptRef.current !== attempt) return; // dialog moved on without us
      toast.success('Welcome back');
      onClose();
      routeAfterAuth(user, false);
    } catch (err: any) {
      if (attemptRef.current !== attempt) return;
      // Stays in the dialog: a wrong password is a retype, not a dead end.
      setError(err.response?.data?.message || 'Those details did not match an account');
    } finally {
      // Guarded like the rest: the flag belongs to whichever attempt is
      // current, so a superseded one must not clear it and re-enable a button
      // whose request is still in flight.
      if (attemptRef.current === attempt) setSigningIn(false);
    }
  }

  // Create an account: a shopper, made on the spot, and signed in. The server
  // only ever asks a BUYER for an emailed code, so this never comes back as
  // 'verification-required'.
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const contact = readContact(identifier);
    const fail = (field: SignupField, message: string) => { setErrorField(field); setError(message); };
    if (name.trim().length < 2) return fail('name', 'Tell us your name (at least 2 characters)');
    if (!contact) return fail('contact', 'Enter a valid email address or phone number');
    if (unmetRules.length) return fail('password', `Your password still needs ${unmetRules.map((r) => r.label).join(', ')}`);
    if (confirm !== password) return fail('confirm', 'The two passwords do not match');

    const attempt = attemptRef.current;
    setSigningIn(true); setError(undefined); setErrorField(undefined);
    try {
      await signup({ name: name.trim(), ...contact, password });
      if (attemptRef.current !== attempt) return;
      toast.success(`Welcome to CropBid, ${name.trim().split(' ')[0]}`);
      onClose();
      // signup() hands back no user; a brand-new shopper needs none to route.
      routeAfterAuth(null, true);
    } catch (err: any) {
      if (attemptRef.current !== attempt) return;
      // A taken email or number is about the contact box; anything else is
      // shown at the foot of the form.
      const status = err.response?.status;
      fail(status === 409 ? 'contact' : 'confirm', err.response?.data?.message || 'Could not create your account just now');
    } finally {
      if (attemptRef.current === attempt) setSigningIn(false);
    }
  }

  // Switching lanes empties the one being left, so nothing half-typed is
  // sitting there submittable when someone comes back to it, and no stale
  // "Enter a valid phone number" greets them on the password form.
  //
  // The identity itself travels, though. Sign-in and create-an-account share
  // one "email or phone" box, so someone who typed their email to sign in and
  // then found they have no account does not type it again. A number typed on
  // the code step carries into that box too, and back the other way only when
  // what they entered really is a number, since the code step has nowhere to
  // send an email address. Passwords never travel.
  function switchTo(next: Mode) {
    setError(undefined); setErrorField(undefined);
    attemptRef.current += 1;
    if (next === 'code') {
      const typed = identifier.trim();
      const digits = typed.replace(/[^0-9]/g, '');
      setPhone(!typed.includes('@') && digits.length >= 7 ? typed : '');
      setIdentifier('');
    } else if (mode === 'code') {
      setIdentifier(phone.trim());
      setChallenge(null); setCode(''); setPhone('');
    }
    setPassword(''); setConfirm('');
    setMode(next);
  }

  async function handleSendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phoneValid) { setError('Enter a valid phone number'); return; }
    if (!emailValid) { setError('Enter a valid email address'); return; }
    setSending(true); setError(undefined);
    try {
      const ch = await startPhoneSignIn(phone.trim(), needsEmail ? email.trim() : undefined);
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

    const attempt = attemptRef.current;
    setVerifying(true); setError(undefined);
    try {
      const { user, created } = await verifyPhoneSignIn(
        challenge.challengeId, code, needsName ? name.trim() : undefined,
      );
      if (attemptRef.current !== attempt) return;
      toast.success(created ? `Welcome to CropBid, ${user.name.split(' ')[0]}` : 'Welcome back');
      onClose();
      routeAfterAuth(user, created);
    } catch (err: any) {
      if (attemptRef.current !== attempt) return;
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
      if (attemptRef.current === attempt) setVerifying(false);
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

          {mode === 'signup' ? (
            <>
              <h2 id="cb-auth-modal-title" className="cb-h3" style={{ margin: 0 }}>
                {(mode === openingMode && title) || <>Create your<br /><span className="cb-italic">account.</span></>}
              </h2>
              <p className="cb-small" style={{ marginTop: 10, marginBottom: 22 }}>
                {intendedRole && intendedRole !== 'CONSUMER'
                  ? 'Make your account first. Your application opens straight after.'
                  : "Takes a minute. You start as a shopper, and can apply to sell or buy in bulk once you're in."}
              </p>

              <form onSubmit={handleSignup} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Your name"
                  placeholder="What should we call you?"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearError(); }}
                  error={errorField === 'name' ? error : undefined}
                  autoFocus
                  required
                />
                <Input
                  label="Email or phone number"
                  placeholder="you@example.com or +91-9876543210"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); clearError(); }}
                  error={errorField === 'contact' ? error : undefined}
                  hint="Whichever you give is what you sign in with."
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Choose a password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  error={errorField === 'password' ? error : undefined}
                  hint={
                    !password ? '8+ characters, with an uppercase letter, a lowercase letter and a number.'
                      : unmetRules.length ? `Still needs ${unmetRules.map((r) => r.label).join(', ')}.`
                      : 'Good to go.'
                  }
                  required
                />
                <Input
                  label="Confirm password"
                  type="password"
                  placeholder="Type it again"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); clearError(); }}
                  error={errorField === 'confirm' ? error : undefined}
                  hint={confirm && confirm !== password ? 'Does not match yet.' : undefined}
                  required
                />

                <Button
                  type="submit"
                  size="lg"
                  loading={signingIn}
                  disabled={!name.trim() || !identifier.trim() || !password || !confirm}
                  style={{ width: '100%' }}
                >
                  Create my account
                  <ArrowIcon />
                </Button>
              </form>

              <p className="cb-small" style={{ marginTop: 16, textAlign: 'center' }}>
                Already have an account?{' '}
                <button type="button" onClick={() => switchTo('password')} style={LINK_BUTTON}>
                  Sign in
                </button>
              </p>
            </>
          ) : mode === 'password' ? (
            <>
              <h2 id="cb-auth-modal-title" className="cb-h3" style={{ margin: 0 }}>
                {(mode === openingMode && title) || <>Sign in<br /><span className="cb-italic">to continue.</span></>}
              </h2>
              <p className="cb-small" style={{ marginTop: 10, marginBottom: 22 }}>
                With the email or phone number and the password you signed up with.
              </p>

              <form onSubmit={handlePasswordSignIn} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Input
                  label="Email or phone number"
                  placeholder="you@example.com or +91-9876543210"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(undefined); }}
                  autoFocus
                  required
                />
                <div>
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Your password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(undefined); }}
                    error={error}
                    required
                  />
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <button
                      type="button"
                      className="cb-small"
                      onClick={() => { onClose(); navigate('/forgot-password'); }}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--cb-ink-3)', cursor: 'pointer', font: 'inherit' }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  loading={signingIn}
                  disabled={!passwordFormValid}
                  style={{ width: '100%' }}
                >
                  Sign in
                  <ArrowIcon />
                </Button>
              </form>

              <p className="cb-small" style={{ marginTop: 16, textAlign: 'center' }}>
                New to CropBid?{' '}
                <button type="button" onClick={() => switchTo('signup')} style={LINK_BUTTON}>
                  Create an account
                </button>
              </p>
              {/* Accounts made through the code before sign-up existed have no
                  password, so this is their only way in. It is also how a
                  phone-only account gets back in after forgetting one. */}
              <p className="cb-small" style={{ marginTop: 6, textAlign: 'center' }}>
                <button type="button" onClick={() => switchTo('code')} style={{ ...LINK_BUTTON, color: 'var(--cb-ink-3)', fontWeight: 400 }}>
                  No password? Get a code on WhatsApp instead
                </button>
              </p>
            </>
          ) : !challenge ? (
            <>
              <h2 id="cb-auth-modal-title" className="cb-h3" style={{ margin: 0 }}>
                Sign in with<br /><span className="cb-italic">a one-time code.</span>
              </h2>
              <p className="cb-small" style={{ marginTop: 10, marginBottom: 22 }}>
                {needsEmail
                  ? "We couldn't reach that number on WhatsApp. Add an email and we'll send the code there."
                  : "We'll send a 6-digit code to your WhatsApp."}
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

              <p className="cb-small" style={{ marginTop: 16, textAlign: 'center' }}>
                <button type="button" onClick={() => switchTo('password')} style={LINK_BUTTON}>
                  ← Sign in with a password
                </button>
              </p>
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
            {/* You agree to TERMS; a privacy policy is something you are told,
                not something you accept. This line pointed only at privacy and
                used the wrong verb for it, because there was nothing to agree
                to until /terms existed. */}
            By continuing you agree to our{' '}
            <a href="/terms" style={{ color: 'var(--cb-ink-2)' }}>terms</a>{' '}
            and acknowledge our{' '}
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
