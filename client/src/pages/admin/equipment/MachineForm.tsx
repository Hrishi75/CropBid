// =============================================================================
// MachineForm — add a machine to a dealer, or edit one
// =============================================================================
// One form for both, so a machine is described the same way whichever way it
// arrived. The server holds the rules and answers in words; this form shows
// only the prices the chosen mode can carry, so nobody is invited to type a day
// rate on a machine that is only for sale.
//
// Those rules are not decoration: /equipment filters a sale search on the sale
// price and a hire search on the day rate falling back to the hourly one, so a
// machine offered for something it has no price for is a row the farmer looking
// for it can never find.
//
// Where the machine is, is where its dealer is. It is not asked for twice.
//
// Saving is not the same as showing: a machine added to a dealer who has been
// taken off the catalogue is saved and stays off it until the dealer is back.
// The picker says which dealers those are rather than letting an admin find out
// from the list afterwards.
// =============================================================================

import { useState, type FormEvent } from 'react';
import api from '../../../lib/axios';
import { apiMessage, MODES, type AdminDealer, type AdminMachine, type CategoryCount } from './types';

interface Props {
  /** Present when editing; absent when adding. */
  machine?: AdminMachine;
  dealers: AdminDealer[];
  categories: CategoryCount[];
  onSaved: (machine: AdminMachine) => void;
  onCancel: () => void;
}

const num = (v: string): number | null => {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

export function MachineForm({ machine, dealers, categories, onSaved, onCancel }: Props) {
  const [dealerId, setDealerId] = useState(machine?.dealerId ?? '');
  const [category, setCategory] = useState(machine?.category ?? 'TRACTOR');
  const [title, setTitle] = useState(machine?.title ?? '');
  const [brand, setBrand] = useState(machine?.brand ?? '');
  const [modelName, setModelName] = useState(machine?.modelName ?? '');
  const [condition, setCondition] = useState<'NEW' | 'USED'>(machine?.condition ?? 'NEW');
  const [yearMade, setYearMade] = useState(machine?.yearMade != null ? String(machine.yearMade) : '');
  const [mode, setMode] = useState<'SALE' | 'RENT' | 'BOTH'>(machine?.mode ?? 'SALE');
  const [salePrice, setSalePrice] = useState(machine?.salePrice != null ? String(machine.salePrice) : '');
  const [perDay, setPerDay] = useState(machine?.rentPricePerDay != null ? String(machine.rentPricePerDay) : '');
  const [perHour, setPerHour] = useState(machine?.rentPricePerHour != null ? String(machine.rentPricePerHour) : '');
  const [deposit, setDeposit] = useState(machine?.securityDeposit != null ? String(machine.securityDeposit) : '');
  const [powerHp, setPowerHp] = useState(machine?.powerHp != null ? String(machine.powerHp) : '');
  const [specs, setSpecs] = useState(machine?.specs.join('\n') ?? '');
  const [description, setDescription] = useState(machine?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dealer = dealers.find((d) => d.id === (machine?.dealerId ?? dealerId));
  const sellable = mode === 'SALE' || mode === 'BOTH';
  const rentable = mode === 'RENT' || mode === 'BOTH';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!machine && !dealerId) return setError('Pick the dealer who has it');

    // Every field is sent on an edit too, so switching mode clears the prices
    // that no longer apply rather than leaving a day rate on a sale-only row.
    const fields = {
      title,
      category,
      brand,
      modelName,
      condition,
      yearMade: num(yearMade),
      mode,
      salePrice: sellable ? num(salePrice) : null,
      rentPricePerDay: rentable ? num(perDay) : null,
      rentPricePerHour: rentable ? num(perHour) : null,
      securityDeposit: rentable ? num(deposit) : null,
      powerHp: num(powerHp),
      specs: specs.split('\n').map((s) => s.trim()).filter(Boolean),
      description,
    };

    setSaving(true);
    try {
      const res = machine
        ? await api.patch<AdminMachine>(`/admin/equipment/${machine.id}`, fields)
        : await api.post<AdminMachine>('/admin/equipment', { dealerId, ...fields });
      onSaved(res.data);
    } catch (err) {
      setError(apiMessage(err, 'Could not save the machine'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="cb-card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 16 }}>
        {machine ? `Edit ${machine.title}` : 'Add a machine'}
      </div>

      <div className="cb-form-grid-2">
        <div>
          <label className="cb-label" htmlFor="mf-dealer">Dealer</label>
          {machine ? (
            <div className="cb-small">{machine.dealer.name} · {machine.location}, {machine.state}</div>
          ) : (
            <select id="mf-dealer" className="cb-input" value={dealerId} onChange={(e) => setDealerId(e.target.value)} required>
              <option value="">Pick a dealer</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.location}, {d.state}{d.active ? '' : ' · taken off the catalogue'}
                </option>
              ))}
            </select>
          )}
          {!machine && dealer && (
            <div className="cb-field-hint">
              Listed in {dealer.location}, {dealer.state}, where the dealer is.
              {dealer.active ? '' : ' This dealer is off the catalogue, so the machine will be saved but will not show on /equipment until they are back on it.'}
            </div>
          )}
        </div>

        <div>
          <label className="cb-label" htmlFor="mf-category">Category</label>
          <select id="mf-category" className="cb-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="cb-label" htmlFor="mf-title">What it is</label>
          <input id="mf-title" className="cb-input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mahindra 575 DI XP Plus" required />
        </div>

        <div>
          <label className="cb-label" htmlFor="mf-brand">Brand (optional)</label>
          <input id="mf-brand" className="cb-input" value={brand} onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Mahindra" />
        </div>

        <div>
          <label className="cb-label" htmlFor="mf-model">Model (optional)</label>
          <input id="mf-model" className="cb-input" value={modelName} onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g. 575 DI XP Plus" />
        </div>

        <div>
          <label className="cb-label" htmlFor="mf-condition">Condition</label>
          <select id="mf-condition" className="cb-input" value={condition}
            onChange={(e) => setCondition(e.target.value as 'NEW' | 'USED')}>
            <option value="NEW">New</option>
            <option value="USED">Used</option>
          </select>
        </div>

        {condition === 'USED' && (
          <div>
            <label className="cb-label" htmlFor="mf-year">Year made</label>
            <input id="mf-year" className="cb-input" inputMode="numeric" value={yearMade}
              onChange={(e) => setYearMade(e.target.value)} placeholder="e.g. 2019" />
          </div>
        )}

        <div>
          <label className="cb-label" htmlFor="mf-power">Horsepower (optional)</label>
          <input id="mf-power" className="cb-input" inputMode="decimal" value={powerHp}
            onChange={(e) => setPowerHp(e.target.value)} placeholder="e.g. 45" />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="cb-label" style={{ marginBottom: 6 }}>Offered for</div>
        <div className="cb-pill-group">
          {MODES.map((m) => (
            <button key={m.value} type="button" className={`cb-pill ${mode === m.value ? 'active' : ''}`}
              onClick={() => setMode(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cb-form-grid-2" style={{ marginTop: 14 }}>
        {sellable && (
          <div>
            <label className="cb-label" htmlFor="mf-sale">Sale price (₹)</label>
            <input id="mf-sale" className="cb-input" inputMode="decimal" value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)} placeholder="e.g. 785000" required />
          </div>
        )}
        {rentable && (
          <>
            <div>
              <label className="cb-label" htmlFor="mf-day">Day rate (₹)</label>
              <input id="mf-day" className="cb-input" inputMode="decimal" value={perDay}
                onChange={(e) => setPerDay(e.target.value)} placeholder="e.g. 2200" />
              <div className="cb-field-hint">A day rate or an hourly rate, whichever the dealer quotes. At least one.</div>
            </div>
            <div>
              <label className="cb-label" htmlFor="mf-hour">Hourly rate (₹)</label>
              <input id="mf-hour" className="cb-input" inputMode="decimal" value={perHour}
                onChange={(e) => setPerHour(e.target.value)} placeholder="e.g. 650" />
            </div>
            <div>
              <label className="cb-label" htmlFor="mf-deposit">Deposit (₹, optional)</label>
              <input id="mf-deposit" className="cb-input" inputMode="decimal" value={deposit}
                onChange={(e) => setDeposit(e.target.value)} placeholder="Refundable" />
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="cb-label" htmlFor="mf-specs">Details, one per line (optional)</label>
        <textarea id="mf-specs" className="cb-input" rows={3} value={specs}
          onChange={(e) => setSpecs(e.target.value)} placeholder={'540 PTO RPM\n1600 kg lift'} />
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="cb-label" htmlFor="mf-description">Description (optional)</label>
        <textarea id="mf-description" className="cb-input" rows={2} value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </div>

      {error && <div className="cb-field-error" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        <button type="submit" className="cb-btn cb-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : machine ? 'Save changes' : 'Add machine'}
        </button>
        <button type="button" className="cb-btn cb-btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
