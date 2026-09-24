// =============================================================================
// DealerForm — add a machinery dealer, or correct one
// =============================================================================
// A new dealer starts with no claims made about them. The verified badge and
// the SMAM listing are entered separately (ClaimsForm), because those are the
// steps somebody has to vouch for.
//
// Editing never shows the phone number or email already on file: the server
// does not send them to any client. Blank means keep what is there.
//
// Town and state ARE editable, unlike a licensed seed shop, where a licence
// covers one premises. Moving a dealer moves their machines with them, because
// /equipment files a machine under its own state.
//
// Changing the name, town, state or phone of a VERIFIED dealer takes the badge
// down, because those are the details the admin ticked to say they had checked.
// The form says so before the change is saved rather than leaving it to be
// noticed afterwards.
// =============================================================================

import { useState, type FormEvent } from 'react';
import api from '../../../lib/axios';
import { apiMessage, type AdminDealer } from './types';

interface Props {
  /** Present when editing; absent when adding. */
  dealer?: AdminDealer;
  /** The states the server accepts, sent with the dealer list. */
  states: string[];
  onSaved: (dealer: AdminDealer) => void;
  onCancel: () => void;
}

export function DealerForm({ dealer, states, onSaved, onCancel }: Props) {
  const [name, setName] = useState(dealer?.name ?? '');
  const [location, setLocation] = useState(dealer?.location ?? '');
  const [state, setState] = useState(dealer?.state ?? 'Maharashtra');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moving = dealer != null && (location.trim() !== dealer.location || state !== dealer.state);
  // Kept in step with VERIFIED_DETAILS on the server, which decides it.
  const dropsBadge = dealer?.verified === true
    && (moving || name.trim() !== dealer.name || phone.trim() !== '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = dealer
        ? await api.patch<AdminDealer>(`/admin/equipment/dealers/${dealer.id}`, {
            ...(name.trim() !== dealer.name && { name }),
            ...(location.trim() !== dealer.location && { location }),
            ...(state !== dealer.state && { state }),
            ...(phone.trim() && { contactPhone: phone }),
            ...(email.trim() && { contactEmail: email }),
          })
        : await api.post<AdminDealer>('/admin/equipment/dealers', {
            name, location, state, contactPhone: phone, contactEmail: email,
          });
      onSaved(res.data);
    } catch (err) {
      setError(apiMessage(err, 'Could not save the dealer'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="cb-card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 16 }}>
        {dealer ? `Edit ${dealer.name}` : 'Add a dealer'}
      </div>

      <div className="cb-form-grid-2">
        <div>
          <label className="cb-label" htmlFor="df-name">Dealer name</label>
          <input id="df-name" className="cb-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sharma Tractors & Implements" required />
        </div>
        <div>
          <label className="cb-label" htmlFor="df-town">Town</label>
          <input id="df-town" className="cb-input" value={location}
            onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Nashik" required />
        </div>
        <div>
          <label className="cb-label" htmlFor="df-state">State</label>
          <select id="df-state" className="cb-input" value={state} onChange={(e) => setState(e.target.value)}>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {moving && (
            <div className="cb-field-hint">
              {dealer!.machines === 0
                ? 'Moving the dealer.'
                : `All ${dealer!.machines} of their machines move to ${location.trim() || '…'}, ${state} too, and answer searches there.`}
            </div>
          )}
        </div>
        <div>
          <label className="cb-label" htmlFor="df-phone">Phone farmers will call</label>
          <input id="df-phone" className="cb-input" type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={dealer ? 'Leave blank to keep the number on file' : 'e.g. +91 98200 00101'}
            required={!dealer} />
          <div className="cb-field-hint">
            Given to a farmer only after they send an enquiry, never shown on the catalogue.
          </div>
        </div>
        <div>
          <label className="cb-label" htmlFor="df-email">Email (optional)</label>
          <input id="df-email" className="cb-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={dealer ? 'Leave blank to keep what is on file' : ''} />
        </div>
      </div>

      {dropsBadge && (
        <div className="cb-tiny" style={{ marginTop: 14, color: 'var(--cb-ember)' }}>
          This takes the verified badge down: it says CropBid checked this name, this address and
          this number. Check the new details and claim it again under Claims.
        </div>
      )}

      {error && <div className="cb-field-error" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        <button type="submit" className="cb-btn cb-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : dealer ? 'Save changes' : 'Add dealer'}
        </button>
        <button type="button" className="cb-btn cb-btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
