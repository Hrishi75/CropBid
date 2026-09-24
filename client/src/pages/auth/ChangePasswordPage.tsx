// =============================================================================
// ChangePasswordPage — the one screen a reset account can reach
// =============================================================================
// Support resets the password for somebody locked out and reads them a
// temporary one (CLAUDE.md §4). It signs them in and nothing else: the server
// refuses every other request until they choose their own, so this is where
// that session lands and the only place it can go.
//
// It does not ask for the temporary password again, and neither does the
// server: they typed it a moment ago to get here, or they came in by phone
// code and never knew it.
//
// Signing out is offered, because somebody who cannot think of a password now
// must not be stuck on a page with no way off it. The account is left exactly
// as it was, still owing the change at the next sign-in.
// =============================================================================

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { passwordPolicyError } from './ResetPasswordPage';
import api, { setAccessToken } from '../../lib/axios';
import type { User } from '../../types';

export function ChangePasswordPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const passwordError = passwordPolicyError(password);
  const confirmError = confirm && confirm !== password ? 'Passwords do not match' : undefined;
  const formValid = !passwordError && password === confirm && confirm.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValid || loading) return;

    setLoading(true);
    try {
      // currentPassword goes empty on purpose: while an account owes this
      // change the server does not ask for the one it is replacing.
      const { data } = await api.post<{ user?: User; accessToken?: string }>('/auth/change-password', {
        currentPassword: '',
        newPassword: password,
      });
      // The token in hand still says a change is owed, and the middleware
      // refuses everything with it. The one the change just minted does not.
      if (data?.accessToken) setAccessToken(data.accessToken);
      // Every other screen reads the flag off the user record, so the copy in
      // memory has to lose it before we leave, or the gate sends us back here.
      if (data?.user) updateUser(data.user);
      else if (user) updateUser({ ...user, mustChangePassword: false });
      toast.success('Password changed');
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not change the password');
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
      </header>

      <div className="cb-auth-body">
        <div className="cb-auth-form-wrap">
          <div className="cb-auth-form">
            <div className="cb-eyebrow">Auth · choose a password</div>
            <h1 className="cb-h2" style={{ marginTop: 14 }}>
              Choose your own<br />
              <span className="cb-italic">password.</span>
            </h1>
            <p className="cb-body" style={{ marginTop: 14, marginBottom: 32 }}>
              CropBid support reset this account{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
              The password you were given works once, to get you here. Nothing else on your account
              opens until you pick a new one: 8+ characters with an uppercase letter, a lowercase
              letter, and a number.
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
                autoFocus
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

              <Button type="submit" size="lg" className="cb-btn-lg" loading={loading} disabled={!formValid} style={{ width: '100%' }}>
                Save and carry on
                <ArrowIcon />
              </Button>
            </form>

            <button
              type="button"
              className="cb-btn cb-btn-link"
              style={{ fontSize: 12, marginTop: 20 }}
              onClick={() => { void logout(); }}
            >
              Sign out instead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
