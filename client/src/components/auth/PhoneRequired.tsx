// =============================================================================
// PhoneRequired: a Google account gives us a phone number before carrying on
// =============================================================================
// Google sign-in hands over a name and an email and never a phone, so an
// account made or linked through it had no number for a seller, a delivery
// rider or support to reach. This asks for one, over every page, whenever a
// signed-in account is Google-linked and has none.
//
// It is mounted once, at the root, rather than as a step inside the sign-in
// window, so a reload or a second tab cannot get past it: it reads the account
// as the server last described it. There is no close button; Sign out is the
// way out for someone who will not give a number.
//
// Accounts made with a password and an email alone are NOT asked: sign-up
// takes an email or a phone, by design (CLAUDE.md section 4). The number is
// not verified, the same as the sign-up form's.
//
// The rest of the page is `inert` while it is open and Tab cycles inside it,
// as in the rates page's dialog: aria-modal alone leaves the page behind
// reachable by keyboard, and this one must not be got round.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isEmbedded } from '../../utils/embedded';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import api from '../../lib/axios';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function PhoneRequired() {
  const { user, loading, updateUser, logout } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // The account on screen now, read when a save comes back: Sign out, or a
  // different sign-in, while it was in flight makes the answer stale.
  const currentId = useRef<string | null>(null);
  useEffect(() => {
    currentId.current = user?.id ?? null;
  }, [user?.id]);

  // Not while a support reset is outstanding: the server refuses everything
  // but the password change until then, this save included.
  const open = Boolean(
    !loading && user && user.googleLinked && !user.phone && !user.mustChangePassword && !isEmbedded(),
  );

  useEffect(() => {
    if (!open || !backdropRef.current) return;

    // Every sibling on the way up from the dialog to <body>, and only those,
    // so closing undoes exactly what opening did.
    const madeInert: Element[] = [];
    for (let node: Element | null = backdropRef.current; node?.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling !== node && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '');
          madeInert.push(sibling);
        }
      }
      if (node.parentElement === document.body) break;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !backdropRef.current) return;
      const inside = Array.from(backdropRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !el.hasAttribute('disabled'));
      if (inside.length === 0) return;
      const first = inside[0];
      const last = inside[inside.length - 1];
      const here = document.activeElement;
      if (e.shiftKey && (here === first || !backdropRef.current.contains(here))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (here === last || !backdropRef.current.contains(here))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      for (const el of madeInert) el.removeAttribute('inert');
    };
  }, [open]);

  if (!open || !user) return null;
  const forId = user.id;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/auth/me/phone', { phone });
      if (currentId.current !== forId) return;
      // The server's copy, not the one on screen: in buying mode the screen
      // shows the account as a BUYER, and storing that would lose the real
      // role and with it the way back to selling.
      updateUser(data.user);
    } catch (err: any) {
      if (currentId.current !== forId) return;
      setError(err.response?.data?.message || 'Could not save that number. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={backdropRef} className="cb-app cb-modal-backdrop">
      <div
        className="cb-modal cb-auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cb-phone-required-title"
      >
        <div className="cb-auth-modal-main">
          <h2 id="cb-phone-required-title" className="cb-h3" style={{ margin: 0 }}>
            One more thing:<br /><span className="cb-italic">your phone number.</span>
          </h2>
          <p className="cb-small" style={{ marginTop: 10, marginBottom: 22 }}>
            Google does not share your number with us. Sellers and delivery need it to reach
            you about an order, and it is how support finds your account if you call.
          </p>
          <form onSubmit={submit} noValidate>
            <Input
              label="Mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98220 55667"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={error || undefined}
              autoFocus
              required
            />
            <Button type="submit" loading={saving} disabled={!phone.trim()} style={{ width: '100%', marginTop: 16 }}>
              Save and continue
            </Button>
          </form>
          <p className="cb-small" style={{ marginTop: 16, textAlign: 'center' }}>
            Signed in as {user.email}.{' '}
            <button type="button" className="cb-btn cb-btn-link" onClick={() => logout()}>
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
