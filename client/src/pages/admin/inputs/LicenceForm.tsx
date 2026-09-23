// =============================================================================
// LicenceForm — enter or remove a shop's seed, fertiliser and pesticide licences
// =============================================================================
// The licence is what decides whether a shop's seed, fertiliser or crop
// protection shows on /inputs at all, and /inputs prints "holds a valid licence
// to sell this category, checked by CropBid" under every product it unlocks.
// So entering one asks the admin to say they have seen the document, and the
// server records that against their account. Removing one asks nothing more
// than a second click: taking a claim down is always safe.
//
// The numbers already on file are never shown, here or anywhere: the server
// sends only whether each one exists. A new number replaces the old.
// =============================================================================

import { useState, type FormEvent } from 'react';
import api from '../../../lib/axios';
import { ConfirmButton } from '../ConfirmButton';
import { apiMessage, LICENCE_KINDS, type AdminSupplier, type LicenceKind } from './types';

interface Props {
  shop: AdminSupplier;
  onSaved: (shop: AdminSupplier) => void;
  onCancel: () => void;
}

const EMPTY: Record<LicenceKind, string> = { seed: '', fertiliser: '', pesticide: '' };

export function LicenceForm({ shop, onSaved, onCancel }: Props) {
  const [numbers, setNumbers] = useState(EMPTY);
  const [seen, setSeen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entered = LICENCE_KINDS.filter(({ key }) => numbers[key].trim());

  async function send(body: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const res = await api.put<AdminSupplier>(`/admin/agri-inputs/suppliers/${shop.id}/licences`, body);
      onSaved(res.data);
    } catch (err) {
      setError(apiMessage(err, 'Could not save the licence'));
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (entered.length === 0) return setError('Type a licence number first');
    if (!seen) return setError('Tick the box to confirm you have seen the document');
    const body: Record<string, unknown> = { paperworkSeen: true };
    for (const { key } of entered) body[key] = numbers[key].trim();
    void send(body);
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--cb-line)' }}>
      <div className="cb-eyebrow" style={{ marginBottom: 12 }}>Licences for {shop.name}</div>

      {LICENCE_KINDS.map(({ key, label, law }) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <label className="cb-label" htmlFor={`lf-${key}`} style={{ marginBottom: 4 }}>
              {label} licence <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>· {law}</span>
            </label>
            {shop.licences[key] ? (
              <span className="cb-tiny" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--cb-sage)' }}>✓ on file</span>
                <ConfirmButton
                  label="Remove"
                  confirmLabel={`Remove the ${label.toLowerCase()} licence? Its products leave /inputs.`}
                  disabled={saving}
                  onConfirm={() => send({ [key]: null })}
                />
              </span>
            ) : (
              <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>none on file</span>
            )}
          </div>
          <input
            id={`lf-${key}`}
            className="cb-input"
            value={numbers[key]}
            onChange={(e) => setNumbers({ ...numbers, [key]: e.target.value })}
            placeholder={shop.licences[key] ? 'Type a new number to replace the one on file' : 'Licence number as printed'}
            autoComplete="off"
          />
        </div>
      ))}

      {entered.length > 0 && (
        <>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--cb-forest)' }} />
            <span className="cb-small">
              I have seen the {entered.map((k) => k.label.toLowerCase()).join(' and ')} licence
              document. It is in this shop's name, for its premises in {shop.location}, {shop.state},
              and it is in date.
            </span>
          </label>
          <div className="cb-tiny" style={{ marginTop: 8, color: 'var(--cb-ink-2)' }}>
            Farmers will see "holds a valid licence, checked by CropBid" on this shop's products.
            This is recorded against your account.
          </div>
        </>
      )}

      {error && <div className="cb-field-error" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        <button type="submit" className="cb-btn cb-btn-primary" disabled={saving || entered.length === 0}>
          {saving ? 'Saving…' : 'Save licences'}
        </button>
        <button type="button" className="cb-btn cb-btn-ghost" onClick={onCancel} disabled={saving}>
          Close
        </button>
      </div>
    </form>
  );
}
