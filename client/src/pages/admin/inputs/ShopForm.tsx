// =============================================================================
// ShopForm — add a seed & fertiliser shop, or correct one
// =============================================================================
// A new shop starts unlicensed and unverified. Licences are entered separately
// (LicenceForm), because that is the step someone has to vouch for.
//
// Editing never shows the phone number or email already on file: the server
// does not send them to any client. Blank means keep what is there.
//
// Town and state cannot be edited. A licence covers one premises in one state,
// so a shop that has moved is a new shop with its own licences.
// =============================================================================

import { useState, type FormEvent } from 'react';
import api from '../../../lib/axios';
import { INDIAN_STATES } from '../../../utils/indianStates';
import { apiMessage, type AdminSupplier } from './types';

interface Props {
  /** Present when editing; absent when adding. */
  shop?: AdminSupplier;
  onSaved: (shop: AdminSupplier) => void;
  onCancel: () => void;
}

export function ShopForm({ shop, onSaved, onCancel }: Props) {
  const [name, setName] = useState(shop?.name ?? '');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = shop
        ? await api.patch<AdminSupplier>(`/admin/agri-inputs/suppliers/${shop.id}`, {
            ...(name.trim() !== shop.name && { name }),
            ...(phone.trim() && { contactPhone: phone }),
            ...(email.trim() && { contactEmail: email }),
          })
        : await api.post<AdminSupplier>('/admin/agri-inputs/suppliers', {
            name, location, state, contactPhone: phone, contactEmail: email,
          });
      onSaved(res.data);
    } catch (err) {
      setError(apiMessage(err, 'Could not save the shop'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="cb-card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 16 }}>
        {shop ? `Edit ${shop.name}` : 'Add a shop'}
      </div>

      <div className="cb-form-grid-2">
        <div>
          <label className="cb-label" htmlFor="sf-name">Shop name</label>
          <input id="sf-name" className="cb-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sahyadri Krishi Kendra" required />
        </div>

        {shop ? (
          <div>
            <div className="cb-label">Town and state</div>
            <div className="cb-small">{shop.location}, {shop.state}</div>
            <div className="cb-field-hint">
              Cannot change: a licence covers one premises in one state. If the shop has moved,
              add it as a new shop.
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="cb-label" htmlFor="sf-town">Town</label>
              <input id="sf-town" className="cb-input" value={location}
                onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Pune" required />
            </div>
            <div>
              <label className="cb-label" htmlFor="sf-state">State</label>
              <select id="sf-state" className="cb-input" value={state} onChange={(e) => setState(e.target.value)}>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="cb-label" htmlFor="sf-phone">Phone farmers will call</label>
          <input id="sf-phone" className="cb-input" type="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={shop ? 'Leave blank to keep the number on file' : 'e.g. +91 98220 41567'}
            required={!shop} />
          <div className="cb-field-hint">
            Given to a farmer only after they send an enquiry, never shown on the catalogue.
          </div>
        </div>
        <div>
          <label className="cb-label" htmlFor="sf-email">Email (optional)</label>
          <input id="sf-email" className="cb-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={shop ? 'Leave blank to keep what is on file' : ''} />
        </div>
      </div>

      {error && <div className="cb-field-error" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        <button type="submit" className="cb-btn cb-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : shop ? 'Save changes' : 'Add shop'}
        </button>
        <button type="button" className="cb-btn cb-btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
