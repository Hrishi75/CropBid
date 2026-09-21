// =============================================================================
// ProductForm — add a seed, fertiliser or other input to a shop, or edit one
// =============================================================================
// One form for both, so a product is described the same way whichever way it
// arrived. The server holds the rules (government price only on fertiliser,
// germination only on seed, at least one crop) and answers in words; this form
// only hides the fields that cannot apply, so nobody is invited to fill them.
//
// Saving is not the same as showing: a seed added to a shop with no seed
// licence is saved and stays hidden from farmers. The form says so before the
// button is pressed rather than leaving it to the list afterwards.
// =============================================================================

import { useState, type FormEvent } from 'react';
import api from '../../../lib/axios';
import { apiMessage, type AdminInput, type AdminSupplier, type CategoryCount } from './types';

interface Props {
  /** Present when editing; absent when adding. */
  product?: AdminInput;
  suppliers: AdminSupplier[];
  categories: CategoryCount[];
  onSaved: (product: AdminInput) => void;
  onCancel: () => void;
}

export function ProductForm({ product, suppliers, categories, onSaved, onCancel }: Props) {
  const [supplierId, setSupplierId] = useState(product?.supplierId ?? '');
  const [category, setCategory] = useState(product?.category ?? 'SEED');
  const [title, setTitle] = useState(product?.title ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [crops, setCrops] = useState(product?.cropNames.join(', ') ?? '');
  const [packSize, setPackSize] = useState(product?.packSize ?? '');
  const [price, setPrice] = useState(product ? String(product.pricePerPack) : '');
  const [subsidised, setSubsidised] = useState(product?.subsidised ?? false);
  const [composition, setComposition] = useState(product?.composition ?? '');
  const [dosage, setDosage] = useState(product?.dosagePerAcre ?? '');
  const [germination, setGermination] = useState(
    product?.germinationPct != null ? String(product.germinationPct) : ''
  );
  const [treatment, setTreatment] = useState(product?.seedTreatment ?? '');
  const [details, setDetails] = useState(product?.specs.join('\n') ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shop = suppliers.find((s) => s.id === (product?.supplierId ?? supplierId));
  const needs = categories.find((c) => c.id === category)?.licence ?? null;
  const willBeHidden = Boolean(shop && needs && !shop.licences[needs]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const pricePerPack = Number(price);
    if (!product && !supplierId) return setError('Pick the shop that sells it');
    if (!Number.isFinite(pricePerPack) || pricePerPack <= 0) return setError('Enter the price of one pack');

    // Every field is sent on an edit too, so switching category clears what no
    // longer applies: a germination figure left on a bag of urea would be printed.
    const fields = {
      title,
      category,
      brand,
      cropNames: crops.split(',').map((c) => c.trim()).filter(Boolean),
      packSize,
      pricePerPack,
      subsidised: category === 'FERTILISER' && subsidised,
      composition,
      dosagePerAcre: dosage,
      germinationPct: category === 'SEED' && germination.trim() ? Number(germination) : null,
      seedTreatment: category === 'SEED' ? treatment : null,
      specs: details.split('\n').map((d) => d.trim()).filter(Boolean),
      description,
    };

    setSaving(true);
    try {
      const res = product
        ? await api.patch<AdminInput>(`/admin/agri-inputs/${product.id}`, fields)
        : await api.post<AdminInput>('/admin/agri-inputs', { supplierId, ...fields });
      onSaved(res.data);
    } catch (err) {
      setError(apiMessage(err, 'Could not save the product'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="cb-card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 16 }}>
        {product ? `Edit ${product.title}` : 'Add a product'}
      </div>

      <div className="cb-form-grid-2">
        {product ? (
          <div>
            <div className="cb-label">Shop</div>
            <div className="cb-small">{product.supplier.name}, {product.supplier.location}</div>
          </div>
        ) : (
          <div>
            <label className="cb-label" htmlFor="pf-shop">Shop</label>
            <select id="pf-shop" className="cb-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Pick a shop…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.location}{s.active ? '' : ' (taken off)'}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="cb-label" htmlFor="pf-category">Category</label>
          <select id="pf-category" className="cb-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="cb-label" htmlFor="pf-title">Product name</label>
          <input id="pf-title" className="cb-input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mahyco Bt Cotton MRC 7351" required />
        </div>
        <div>
          <label className="cb-label" htmlFor="pf-brand">Brand (optional)</label>
          <input id="pf-brand" className="cb-input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="cb-label" htmlFor="pf-crops">Crops it is for</label>
        <input id="pf-crops" className="cb-input" value={crops} onChange={(e) => setCrops(e.target.value)}
          placeholder="Cotton, Soybean" />
        <div className="cb-field-hint">
          Separate crops with commas. This is how farmers find it on /inputs, and a crop the
          catalogue already has is matched to its spelling there.
        </div>
      </div>

      <div className="cb-form-grid-2" style={{ marginTop: 14 }}>
        <div>
          <label className="cb-label" htmlFor="pf-pack">One pack is</label>
          <input id="pf-pack" className="cb-input" value={packSize} onChange={(e) => setPackSize(e.target.value)}
            placeholder="e.g. 45 kg bag, 475 g packet, 500 ml" required />
        </div>
        <div>
          <label className="cb-label" htmlFor="pf-price">Price per pack (₹)</label>
          <input id="pf-price" className="cb-input" type="number" inputMode="decimal" min="0" step="0.01"
            value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
      </div>

      {category === 'FERTILISER' && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginTop: 14 }}>
          <input type="checkbox" checked={subsidised} onChange={(e) => setSubsidised(e.target.checked)}
            style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--cb-forest)' }} />
          <span className="cb-small">
            The price is set by government (urea, DAP, MOP). /inputs will say it is the same at
            every licensed shop.
          </span>
        </label>
      )}

      <div className="cb-form-grid-2" style={{ marginTop: 14 }}>
        <div>
          <label className="cb-label" htmlFor="pf-composition">Composition (optional)</label>
          <input id="pf-composition" className="cb-input" value={composition}
            onChange={(e) => setComposition(e.target.value)} placeholder="e.g. NPK 10:26:26" />
        </div>
        <div>
          <label className="cb-label" htmlFor="pf-dosage">Dose per acre (optional)</label>
          <input id="pf-dosage" className="cb-input" value={dosage}
            onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 2 bags / acre" />
        </div>

        {category === 'SEED' && (
          <>
            <div>
              <label className="cb-label" htmlFor="pf-germination">Germination on the label, % (optional)</label>
              <input id="pf-germination" className="cb-input" type="number" min="0" max="100" step="1"
                value={germination} onChange={(e) => setGermination(e.target.value)} />
            </div>
            <div>
              <label className="cb-label" htmlFor="pf-treatment">Seed treatment (optional)</label>
              <input id="pf-treatment" className="cb-input" value={treatment}
                onChange={(e) => setTreatment(e.target.value)} placeholder="e.g. Thiram treated" />
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="cb-label" htmlFor="pf-details">Details (optional)</label>
        <textarea id="pf-details" className="cb-input" rows={3} value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={'160–180 day duration\nSucking-pest tolerant'} />
        <div className="cb-field-hint">
          One per line, up to 10. Shown to farmers under "Details" on /inputs.
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="cb-label" htmlFor="pf-description">Description (optional)</label>
        <textarea id="pf-description" className="cb-input" rows={2} value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </div>

      {willBeHidden && shop && needs && (
        <div className="cb-small" style={{ marginTop: 14, color: 'var(--cb-ember)' }}>
          {shop.name} has no {needs} licence on file, so this will be saved but hidden from farmers
          until one is entered under Shops → Licences.
        </div>
      )}

      {error && <div className="cb-field-error" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        <button type="submit" className="cb-btn cb-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </button>
        <button type="button" className="cb-btn cb-btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
