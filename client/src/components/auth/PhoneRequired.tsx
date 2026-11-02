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
// =============================================================================

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isEmbedded } from '../../utils/embedded';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import api from '../../lib/axios';

export function PhoneRequired() {
  const { user, loading, updateUser, logout } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Not while a support reset is outstanding: the server refuses everything
  // but the password change until then, this save included.
  if (loading || !user || !user.googleLinked || user.phone || user.mustChangePassword || isEmbedded()) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/auth/me/phone', { phone });
      // Keep the role the page is showing (buying mode reports BUYER); only
      // the number is new.
      updateUser({ ...user!, phone: data.user.phone });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save that number. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cb-app cb-modal-backdrop">
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
