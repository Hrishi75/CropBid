// =============================================================================
// CreateRequirement — Post or edit a buyer requirement
// =============================================================================
// Dual-purpose form, same shape as CreateListing: with a :id route param it
// loads the existing requirement and runs in EDIT mode; without one it CREATES.
// Collects crop, quantity, grade, the price the buyer will pay, delivery
// destination and deadline, then POSTs/PUTs to /requirements.
//
// JSON only — a requirement carries no images, so there is no FormData branch.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import { mspForCrop } from '../../utils/msp';
import { CROP_CATEGORIES, ALL_CROPS, resolveCatalogueCrop } from '../../utils/crops';
import {
  VoiceCaptureButton,
  REQUIREMENT_EXAMPLES,
  type VoiceDraft,
  type VoiceRequirementFields,
} from '../../components/voice/VoiceCaptureButton';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 0', borderBottom: '1px solid var(--cb-line)' }}>
      <div className="cb-eyebrow">{title}</div>
      {children}
    </div>
  );
}

export function CreateRequirement() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('QUINTAL');
  const [qualityGrade, setQualityGrade] = useState('A');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [description, setDescription] = useState('');
  const [organic, setOrganic] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  // Only meaningful in edit mode — how much is already spoken for, which is the
  // floor the quantity can be edited down to.
  const [filled, setFilled] = useState(0);

  // Voice dictation. `unmatchedCrop` holds a crop we heard but could not map to
  // the catalogue, so the buyer is told what to fix rather than left with a
  // silently empty picker.
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft<VoiceRequirementFields> | null>(null);
  const [unmatchedCrop, setUnmatchedCrop] = useState('');

  function applyVoiceDraft(draft: VoiceDraft<VoiceRequirementFields>) {
    const f = draft.fields;
    setVoiceDraft(draft);
    setUnmatchedCrop('');

    if (f.cropName) {
      // The model answers in English ("Tomato"); the picker needs a catalogue
      // value. resolveCatalogueCrop also handles spoken Hindi/Marathi names.
      const matched = resolveCatalogueCrop(f.cropName);
      if (matched) setCropName(matched);
      else setUnmatchedCrop(f.cropName);
    }
    if (f.cropVariety) setCropVariety(f.cropVariety);
    if (f.quantity !== null) setQuantity(String(f.quantity));
    if (f.unit) setUnit(f.unit);
    if (f.qualityGrade) setQualityGrade(f.qualityGrade);
    if (f.pricePerUnit !== null) setPricePerUnit(String(f.pricePerUnit));
    if (f.neededBy) setNeededBy(f.neededBy);
    if (f.description) setDescription(f.description);
    if (f.organic) setOrganic(true);
    if (f.deliveryLocation) setDeliveryLocation(f.deliveryLocation);
    if (f.deliveryState) {
      const matched = INDIAN_STATES.find((s) => s.toLowerCase() === f.deliveryState!.toLowerCase());
      if (matched) setDeliveryState(matched);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!editId) return;
    setFetching(true);
    api.get(`/requirements/${editId}`)
      .then((res) => {
        const r = res.data;
        setCropName(r.cropName || '');
        setCropVariety(r.cropVariety || '');
        setQuantity(String(r.quantity || ''));
        setUnit(r.unit || 'QUINTAL');
        setQualityGrade(r.qualityGrade || 'A');
        setPricePerUnit(String(r.pricePerUnit || ''));
        setDeliveryLocation(r.deliveryLocation || '');
        setDeliveryState(r.deliveryState || '');
        setNeededBy(r.neededBy ? r.neededBy.split('T')[0] : '');
        setDescription(r.description || '');
        setOrganic(r.organic || false);
        setPaymentTerms(r.paymentTerms || '');
        setDeliveryTerms(r.deliveryTerms || '');
        setFilled((r.quantity || 0) - (r.remainingQuantity ?? r.quantity ?? 0));
      })
      .catch(() => {
        toast.error('Failed to load requirement');
        navigate('/buyer/requirements');
      })
      .finally(() => setFetching(false));
  }, [editId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity);
    const price = parseFloat(pricePerUnit);

    if (isEditMode && filled > 0 && qty < filled) {
      toast.error(`${filled} ${unit.toLowerCase()} is already filled — quantity can't go below that`);
      return;
    }

    // Government MSP guard, inverted from CreateListing: there the farmer is
    // warned about selling too low, here the buyer is warned about ASKING a
    // farmer to. Warn but don't block — the server stays permissive too.
    const msp = mspForCrop(cropName, unit);
    if (msp != null && price < msp) {
      const proceed = window.confirm(
        `The government MSP for ${cropName} is ${formatCurrency(msp, 'INR')} per ${unit.toLowerCase()}. ` +
          `Your price of ${formatCurrency(price, 'INR')} is below it — you'd be asking farmers to sell under the support price, ` +
          `and many will simply skip your requirement.\n\nPost anyway?`,
      );
      if (!proceed) return;
    }

    setLoading(true);
    try {
      const payload = {
        cropName,
        cropVariety: cropVariety || undefined,
        quantity: qty,
        unit,
        qualityGrade,
        pricePerUnit: price,
        // Platform money is ₹-native: prices are typed against ₹ MSP/mandi
        // anchors, so a requirement is always stored in INR regardless of the
        // account's display currency.
        currency: 'INR',
        deliveryLocation,
        deliveryState,
        neededBy: neededBy || undefined,
        description: description || undefined,
        organic,
        paymentTerms: paymentTerms || undefined,
        deliveryTerms: deliveryTerms || undefined,
      };

      if (isEditMode) {
        await api.put(`/requirements/${editId}`, payload);
      } else {
        await api.post('/requirements', payload);
      }
      toast.success(isEditMode ? 'Requirement updated' : 'Requirement posted');
      navigate('/buyer/requirements');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to post requirement');
    } finally {
      setLoading(false);
    }
  }

  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(pricePerUnit) || 0;
  const msp = mspForCrop(cropName, unit);
  const belowMsp = msp != null && priceNum > 0 && priceNum < msp;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/buyer/requirements" style={{ color: 'inherit', textDecoration: 'none' }}>Requirements</Link>
        {' / '}{isEditMode ? 'Edit' : 'New'}
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Tell farmers what you <span className="cb-italic">need.</span>
      </h1>
      <p className="cb-page-lede">
        Post the crop, volume and price you'll pay. Farmers fill it outright or counter with their own price.
      </p>

      <div className="cb-split" style={{ gap: 24, marginTop: 28 }}>
        <form onSubmit={handleSubmit} className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '4px 24px' }}>
            {/* Voice input. Renders nothing when the server reports it is
                unavailable, so the typed form below is never affected — typing
                remains the primary path, dictation just pre-fills it. Edit mode
                is excluded: dictating over a live requirement would overwrite
                terms farmers may already be responding to. */}
            {!isEditMode && (
              <div style={{ paddingTop: 20 }}>
                <VoiceCaptureButton<VoiceRequirementFields>
                  onDraft={applyVoiceDraft}
                  endpoint="/voice/requirement-draft"
                  prompt="Say the crop, how much you need, the grade, where to deliver, and your price."
                  examples={REQUIREMENT_EXAMPLES}
                />
              </div>
            )}

            {voiceDraft && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: '1px solid var(--cb-line)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div className="cb-small" style={{ fontWeight: 600 }}>
                    Filled from your voice note — check every field before posting.
                  </div>
                  <button
                    type="button"
                    className="cb-link"
                    style={{ marginLeft: 'auto', background: 'none', border: 0, cursor: 'pointer' }}
                    onClick={() => setVoiceDraft(null)}
                  >
                    Dismiss
                  </button>
                </div>
                {/* The transcript verbatim, so the buyer can see exactly what
                    was heard rather than guessing why a field looks wrong. */}
                <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)', fontStyle: 'italic' }}>
                  “{voiceDraft.transcript}”
                </div>
                {unmatchedCrop && (
                  <div className="cb-tiny" style={{ color: 'var(--cb-warn, #b8860b)' }}>
                    We heard “{unmatchedCrop}” but couldn't match it to a crop. Please pick one below.
                  </div>
                )}
              </div>
            )}

            <Section title="Crop">
              <div>
                <label className="cb-label">Crop</label>
                <select value={cropName} onChange={(e) => setCropName(e.target.value)} className="cb-input" required>
                  <option value="">Select crop</option>
                  {cropName && !ALL_CROPS.includes(cropName) && (
                    <option value={cropName}>{cropName}</option>
                  )}
                  {CROP_CATEGORIES.map((cat) => (
                    <optgroup key={cat.name} label={`${cat.icon} ${cat.name}`}>
                      {cat.crops.map((c) => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <Input
                label="Variety (optional)"
                placeholder="e.g., Basmati, Shankar-6, 12.5% protein"
                value={cropVariety}
                onChange={(e) => setCropVariety(e.target.value)}
              />
            </Section>

            <Section title="Volume & grade">
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input
                  label="Quantity needed"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g., 500"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  hint={isEditMode && filled > 0 ? `${filled} ${unit.toLowerCase()} already filled` : undefined}
                  required
                />
                <div>
                  <label className="cb-label">Unit</label>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className="cb-input">
                    <option value="KG">Kilogram (KG)</option>
                    <option value="QUINTAL">Quintal (100 KG)</option>
                    <option value="TONNE">Metric Tonne</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="cb-label">Minimum grade</label>
                <div className="cb-pill-group">
                  {['A', 'B', 'C'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`cb-pill ${qualityGrade === g ? 'active' : ''}`}
                      onClick={() => setQualityGrade(g)}
                    >
                      Grade {g}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={organic}
                  onChange={(e) => setOrganic(e.target.checked)}
                  style={{ accentColor: 'var(--cb-forest)' }}
                />
                Certified organic only
              </label>
            </Section>

            <Section title="Price you'll pay">
              <Input
                label={`Price per ${unit.toLowerCase()}`}
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g., 7000"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                error={belowMsp ? `Below the government MSP of ${formatCurrency(msp!, 'INR')} — farmers may skip this` : undefined}
                hint={!belowMsp && msp != null ? `Government MSP is ${formatCurrency(msp, 'INR')} per ${unit.toLowerCase()}` : undefined}
                required
              />
              <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                Farmers can fill at this price in one tap, or send a counter-offer you review.
              </div>
            </Section>

            <Section title="Delivery">
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input
                  label="Deliver to (city/town)"
                  placeholder="e.g., Nagpur"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  required
                />
                <div>
                  <label className="cb-label">State</label>
                  <select value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} className="cb-input" required>
                    <option value="">Select state</option>
                    {deliveryState && !INDIAN_STATES.includes(deliveryState) && (
                      <option value={deliveryState}>{deliveryState}</option>
                    )}
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <Input
                label="Needed by (optional)"
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
              />
            </Section>

            <Section title="Commercial terms (optional)">
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <div>
                  <label className="cb-label">Payment terms</label>
                  <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="cb-input">
                    <option value="">Not specified</option>
                    <option value="LC">Letter of credit</option>
                    <option value="NET7">Net 7 days</option>
                    <option value="NET15">Net 15 days</option>
                  </select>
                </div>
                <div>
                  <label className="cb-label">Delivery terms</label>
                  <select value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} className="cb-input">
                    <option value="">Not specified</option>
                    <option value="FOB">FOB — free on board</option>
                    <option value="CIF">CIF — cost, insurance, freight</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="cb-label">Notes for farmers (optional)</label>
                <textarea
                  className="cb-input"
                  rows={3}
                  placeholder="Moisture limits, packaging, lab report expectations…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </Section>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '18px 24px' }}>
            <Button type="submit" loading={loading} disabled={fetching}>
              {isEditMode ? 'Save changes' : 'Post requirement'} <ArrowIcon />
            </Button>
            <Link to="/buyer/requirements" className="cb-btn cb-btn-link">Cancel</Link>
          </div>
        </form>

        {/* Live preview — the card farmers will see in their feed. */}
        <aside style={{ position: 'sticky', top: 76, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cb-card" style={{ padding: 20 }}>
            <div className="cb-eyebrow" style={{ marginBottom: 12 }}>As farmers will see it</div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>
              {cropName || 'Crop'}{cropVariety ? ` · ${cropVariety}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="cb-chip">Grade {qualityGrade}</span>
              {organic && <span className="cb-chip cb-chip-sage">Organic only</span>}
              {belowMsp && <span className="cb-chip cb-chip-ember">Below MSP</span>}
            </div>
            <div className="cb-cols-2" style={{ gap: 12 }}>
              <div>
                <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>WANTS</div>
                <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
                  {priceNum ? formatCurrency(priceNum, 'INR') : '—'}
                  <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}> /{unit.toLowerCase()}</span>
                </div>
              </div>
              <div>
                <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>QUANTITY</div>
                <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
                  {qtyNum ? `${qtyNum} ${unit.toLowerCase()}` : '—'}
                </div>
              </div>
            </div>
            {qtyNum > 0 && priceNum > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cb-line)' }}>
                <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TOTAL IF FULLY FILLED</div>
                <div className="cb-mono" style={{ fontSize: 18, fontWeight: 500 }}>
                  {formatCurrency(qtyNum * priceNum, 'INR')}
                </div>
              </div>
            )}
          </div>

          <div className="cb-card" style={{ padding: 20 }}>
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>How it fills</div>
            <p className="cb-small" style={{ color: 'var(--cb-ink-3)', margin: 0 }}>
              Several farmers can each supply part of this requirement. Every fill becomes its own
              deal with its own payment, so you may pay in more than one instalment.
            </p>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
