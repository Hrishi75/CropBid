// =============================================================================
// ClaimsForm — the verified badge and the SMAM listing for a dealer
// =============================================================================
// Both are claims CropBid makes to a farmer. `verified` badges the dealer and
// sorts them above everyone else on /equipment; `smamEmpanelled` says a farmer
// can claim a government subsidy through them, which is a thing they will act
// on and be out of pocket over if it is wrong.
//
// So making either asks the admin to say they have checked, and the server
// records that against their account in the same transaction as the change.
// Taking one down asks nothing more than a second click: removing a claim is
// always safe.
// =============================================================================

import { useState } from 'react';
import api from '../../../lib/axios';
import { ConfirmButton } from '../ConfirmButton';
import { apiMessage, type AdminDealer } from './types';

interface Props {
  dealer: AdminDealer;
  onSaved: (dealer: AdminDealer) => void;
  onCancel: () => void;
}

type Claim = 'verified' | 'smamEmpanelled';

const CLAIMS: { key: Claim; label: string; says: string }[] = [
  {
    key: 'verified',
    label: 'Verified dealer',
    says: 'Farmers see a verified badge, and this dealer is shown above unverified ones.',
  },
  {
    key: 'smamEmpanelled',
    label: 'SMAM empanelled',
    says: 'Farmers are told they can buy through the government subsidy scheme here.',
  },
];

export function ClaimsForm({ dealer, onSaved, onCancel }: Props) {
  const [pending, setPending] = useState<Claim | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const res = await api.put<AdminDealer>(`/admin/equipment/dealers/${dealer.id}/claims`, body);
      setPending(null);
      setChecked(false);
      onSaved(res.data);
    } catch (err) {
      setError(apiMessage(err, 'Could not save the claim'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--cb-line)' }}>
      <div className="cb-eyebrow" style={{ marginBottom: 12 }}>What we tell farmers about {dealer.name}</div>

      {CLAIMS.map(({ key, label, says }) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <div>
              <span className="cb-label" style={{ marginBottom: 2 }}>{label}</span>
              <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{says}</div>
            </div>
            {dealer[key] ? (
              <span className="cb-tiny" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--cb-sage)' }}>✓ claimed</span>
                <ConfirmButton
                  label="Take it down"
                  confirmLabel={`Stop telling farmers this about ${dealer.name}?`}
                  disabled={saving}
                  onConfirm={() => send({ [key]: false })}
                />
              </span>
            ) : pending === key ? (
              <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>confirm below</span>
            ) : (
              <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}
                disabled={saving} onClick={() => { setPending(key); setChecked(false); setError(null); }}>
                Make this claim
              </button>
            )}
          </div>
        </div>
      ))}

      {pending && (
        <div style={{ marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--cb-forest)' }} />
            <span className="cb-small">
              {pending === 'verified'
                ? `I have checked ${dealer.name}: the business exists at ${dealer.location}, ${dealer.state}, the phone number reaches them, and the machines listed are theirs to sell or hire.`
                : `I have checked that ${dealer.name} is empanelled under SMAM and a farmer can buy through the subsidy scheme here today.`}
            </span>
          </label>
          <div className="cb-tiny" style={{ marginTop: 8, color: 'var(--cb-ink-2)' }}>
            This is recorded against your account.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <button type="button" className="cb-btn cb-btn-primary" disabled={saving || !checked}
              onClick={() => send({ [pending]: true, checked: true })}>
              {saving ? 'Saving…' : 'Make the claim'}
            </button>
            <button type="button" className="cb-btn cb-btn-ghost" disabled={saving} onClick={() => setPending(null)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {error && <div className="cb-field-error" role="alert">{error}</div>}

      {!pending && (
        <button type="button" className="cb-btn cb-btn-ghost" style={{ marginTop: 6 }} onClick={onCancel}>
          Close
        </button>
      )}
    </div>
  );
}
