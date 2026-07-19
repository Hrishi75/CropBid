// =============================================================================
// SettingsPage — Account, role profile, and password management
// =============================================================================
// Shared by all roles. Four cards:
//   1. Account   — name / phone / location (everyone)
//   2. Role      — farm details (farmer) or company details (buyer)
//   3. Password  — change password with current-password confirmation
//   4. Danger    — delete the account (password + modal confirmation)
//
// Profile edits go through PATCH /auth/me, which returns the same { user }
// shape as GET /me — we drop it straight into AuthContext so the sidebar and
// dashboards update immediately. The password form is a separate submit and
// never mixes with profile state.
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { CROP_CATEGORIES } from '../../utils/crops';
import { passwordPolicyError } from '../auth/ResetPasswordPage';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { CompanyType } from '../../types';

const COMPANY_TYPES: [CompanyType, string][] = [
  ['PROCESSOR', 'Processor'],
  ['FMCG', 'FMCG'],
  ['RESTAURANT', 'Restaurant'],
  ['EXPORTER', 'Exporter'],
  ['RETAILER', 'Retailer'],
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cb-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="cb-eyebrow">{title}</div>
        {hint && <div className="cb-tiny" style={{ marginTop: 4 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const isFarmer = user?.role === 'FARMER';
  const isBuyer = user?.role === 'BUYER';

  // --- Profile state (account + role fields, saved together) ---
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [location, setLocation] = useState(user?.location || '');

  const [farmSize, setFarmSize] = useState(user?.farmerProfile?.farmSizeAcres?.toString() || '');
  const [state, setState] = useState(user?.farmerProfile?.state || '');
  const [crops, setCrops] = useState<string[]>(user?.farmerProfile?.cropsGrown || []);

  const [companyName, setCompanyName] = useState(user?.buyerProfile?.companyName || '');
  const [companyType, setCompanyType] = useState<CompanyType>(user?.buyerProfile?.companyType || 'PROCESSOR');
  const [taxId, setTaxId] = useState(user?.buyerProfile?.taxId || '');
  const [volume, setVolume] = useState(user?.buyerProfile?.annualProcurementVolume || '');

  const [savingProfile, setSavingProfile] = useState(false);

  // --- Password state (independent form) ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // --- Delete account (password confirmation + modal) ---
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const newPasswordError = newPassword ? passwordPolicyError(newPassword) : undefined;
  const confirmError = confirmPassword && confirmPassword !== newPassword ? 'Passwords do not match' : undefined;
  const passwordFormValid =
    currentPassword.length > 0 && !newPasswordError && newPassword.length > 0 && newPassword === confirmPassword;

  function toggleCrop(crop: string) {
    setCrops((prev) => (prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]));
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim() || null,
        location: location.trim() || null,
      };
      if (isFarmer) {
        if (farmSize) payload.farmSizeAcres = Number(farmSize);
        if (state.trim()) payload.state = state.trim();
        if (crops.length > 0) payload.cropsGrown = crops;
      }
      if (isBuyer) {
        if (companyName.trim()) payload.companyName = companyName.trim();
        payload.companyType = companyType;
        payload.taxId = taxId.trim() || null;
        payload.annualProcurementVolume = volume.trim() || null;
      }

      const { data } = await api.patch('/auth/me', payload);
      updateUser(data.user);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordFormValid) return;
    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await api.delete('/auth/me', { data: { password: deletePassword } });
      toast.success('Your account has been deleted');
      // The server session is gone; logout() clears local state either way.
      await logout();
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Settings · {user?.role.toLowerCase()}</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Tune your<br />
        <span className="cb-italic">account.</span>
      </h1>

      <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 28 }}>
        <Section title="Account" hint="How you appear across listings, bids and negotiations.">
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--cb-line)' }}>
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{user?.email}</span>
            <span className="cb-tiny" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>email · locked</span>
          </div>
          <div className="cb-form-grid-2">
            <Input
              label="Full name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Phone"
              placeholder="e.g., +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Input
            label="Location (city / town)"
            placeholder="e.g., Nashik"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Section>

        {isFarmer && user?.farmerProfile && (
          <Section title="Farm" hint="Your agent uses these to match buyers and set price anchors.">
            <div className="cb-form-grid-2">
              <Input
                label="Farm size (acres)"
                type="number"
                min="0.1"
                step="0.1"
                placeholder="e.g., 15"
                value={farmSize}
                onChange={(e) => setFarmSize(e.target.value)}
              />
              <Input
                label="State / region"
                placeholder="e.g., Maharashtra"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div>
              <label className="cb-label">Crops grown · {crops.length} selected</label>
              {crops.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {crops.map((crop) => (
                    <button
                      key={crop}
                      type="button"
                      onClick={() => toggleCrop(crop)}
                      className="cb-chip cb-chip-sage"
                      style={{ cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--cb-font-sans)' }}
                      title="Remove"
                    >
                      {crop} ✕
                    </button>
                  ))}
                </div>
              )}
              <select
                className="cb-input"
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleCrop(e.target.value);
                }}
              >
                <option value="">+ Add a crop…</option>
                {CROP_CATEGORIES.map((cat) => (
                  <optgroup key={cat.name} label={cat.name}>
                    {cat.crops
                      .filter((c) => !crops.includes(c))
                      .map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </Section>
        )}

        {isBuyer && user?.buyerProfile && (
          <Section title="Company" hint="Shown to farmers when you bid, and used for invoices.">
            <Input
              label="Company name"
              placeholder="e.g., Agri Foods Pvt Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <div>
              <label className="cb-label">Company type</label>
              <div className="cb-pill-group">
                {COMPANY_TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCompanyType(value)}
                    className={`cb-pill ${companyType === value ? 'active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cb-form-grid-2">
              <Input
                label={user?.country === 'India' ? 'GST number' : 'Tax ID'}
                placeholder={user?.country === 'India' ? 'e.g., 27AABCA1234A1ZA' : 'Tax identification number'}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
              <Input
                label="Annual procurement volume"
                placeholder="e.g., 5000-10000 tonnes"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
              />
            </div>
          </Section>
        )}

        <div>
          <Button type="submit" size="lg" loading={savingProfile}>
            Save changes
          </Button>
        </div>
      </form>

      <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        <Section title="Password" hint="Changing your password keeps you signed in on this device.">
          <Input
            label="Current password"
            type="password"
            placeholder="Enter your current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="cb-form-grid-2">
            <Input
              label="New password"
              type="password"
              placeholder="8+ chars, Aa1"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={newPasswordError}
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={confirmError}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Button type="submit" loading={savingPassword} disabled={!passwordFormValid}>
              Change password
            </Button>
          </div>
        </Section>
      </form>

      <div style={{ marginTop: 24 }}>
        <Section
          title="Danger zone"
          hint="Deleting your account removes your profile, listings, bids and notifications for good. Completed deals stay on record without your personal details. Deals with money still in escrow must settle first."
        >
          <div className="cb-form-grid-2">
            <Input
              label="Your password"
              type="password"
              placeholder="Confirm with your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <Button
              type="button"
              variant="danger"
              disabled={!deletePassword}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete my account
            </Button>
          </div>
        </Section>
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title="Delete your account?"
        message="This cannot be undone. Your profile, listings, bids and notifications are removed permanently; completed deals stay on record without your personal details."
        confirmLabel="Delete forever"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmingDelete(false)}
      />
    </DashboardLayout>
  );
}
