// =============================================================================
// CreateListing — Create or edit a crop listing
// =============================================================================
// Dual-purpose form: with a :id route param it loads the existing listing and
// runs in EDIT mode; without one it CREATES a new listing. Collects crop, qty,
// unit, grade, price range, location, certifications, and photos (ImageUploader),
// then POSTs/PUTs to /listings. CROP_CATEGORIES and INDIAN_STATES drive the dropdowns.
// =============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { ImageUploader } from '../../components/listings/ImageUploader';
import { formatCurrency } from '../../utils/currency';
import { mspForCrop } from '../../utils/msp';
import { CROP_CATEGORIES, ALL_CROPS, resolveCatalogueCrop } from '../../utils/crops';
import { VoiceCaptureButton, type VoiceDraft } from '../../components/voice/VoiceCaptureButton';
import { cropImageFor } from '../../utils/cropImages';
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

export function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  // 'standard' = use the built-in stock photo for the crop (no upload needed —
  // every listing surface falls back to it automatically when images[] is empty).
  // 'own' = farmer uploads their own photos.
  const [photoMode, setPhotoMode] = useState<'standard' | 'own'>('standard');

  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('QUINTAL');
  const [qualityGrade, setQualityGrade] = useState('A');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  const [description, setDescription] = useState('');
  const [organic, setOrganic] = useState(false);
  // The retail channel. Off by default: a farmer opting into consumer sales is
  // a deliberate choice about packing and last-mile, not something to inherit.
  // Until this is on with a price, the lot is invisible to shoppers — the
  // consumer storefront queries /browse?directSale=true.
  const [directSaleEnabled, setDirectSaleEnabled] = useState(false);
  const [retailPrice, setRetailPrice] = useState('');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');

  // What the voice note filled in, kept so the farmer can read back what was
  // heard and check it against the fields. Null when they haven't used voice.
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [unmatchedCrop, setUnmatchedCrop] = useState('');

  // Apply a voice draft to the form. Only non-null fields are written, so a
  // second recording tops up what the first missed instead of wiping it.
  //
  // Auto-filling beats a separate "review these suggestions" modal for a
  // farmer who may not read comfortably: the form IS the review, every value
  // is visible and editable in place, and Publish stays the only commit.
  function applyVoiceDraft(draft: VoiceDraft) {
    const f = draft.fields;
    setVoiceDraft(draft);
    setUnmatchedCrop('');

    if (f.cropName) {
      // The model answers in English ("Onion"); the picker needs a catalogue
      // value. resolveCatalogueCrop also handles spoken Hindi/Marathi names
      // via the alias table.
      const matched = resolveCatalogueCrop(f.cropName);
      if (matched) setCropName(matched);
      // Never guess wrong silently — leave the picker empty and say what we
      // heard, so the farmer knows exactly what to fix.
      else setUnmatchedCrop(f.cropName);
    }
    if (f.cropVariety) setCropVariety(f.cropVariety);
    if (f.quantity !== null) setQuantity(String(f.quantity));
    if (f.unit) setUnit(f.unit);
    if (f.qualityGrade) setQualityGrade(f.qualityGrade);
    if (f.pricePerUnitMin !== null) setPriceMin(String(f.pricePerUnitMin));
    if (f.pricePerUnitMax !== null) setPriceMax(String(f.pricePerUnitMax));
    if (f.harvestDate) setHarvestDate(f.harvestDate);
    if (f.description) setDescription(f.description);
    if (f.organic) setOrganic(true);
    if (f.location) setLocation(f.location);
    if (f.state) {
      const matched = INDIAN_STATES.find((s) => s.toLowerCase() === f.state!.toLowerCase());
      if (matched) setState(matched);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!editId) return;
    setFetching(true);
    api.get(`/listings/${editId}`)
      .then((res) => {
        const l = res.data;
        setCropName(l.cropName || '');
        setCropVariety(l.cropVariety || '');
        setQuantity(String(l.quantity || ''));
        setUnit(l.unit || 'QUINTAL');
        setQualityGrade(l.qualityGrade || 'A');
        setPriceMin(String(l.pricePerUnitMin || ''));
        setPriceMax(String(l.pricePerUnitMax || ''));
        setHarvestDate(l.harvestDate ? l.harvestDate.split('T')[0] : '');
        setDescription(l.description || '');
        setOrganic(l.organic || false);
        setDirectSaleEnabled(l.directSaleEnabled || false);
        setRetailPrice(l.retailPricePerUnit != null ? String(l.retailPricePerUnit) : '');
        setLocation(l.location || '');
        setState(l.state || '');
      })
      .catch(() => {
        toast.error('Failed to load listing');
        navigate('/farmer/listings');
      })
      .finally(() => setFetching(false));
  }, [editId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parseFloat(priceMin) > parseFloat(priceMax)) {
      toast.error('Minimum price cannot exceed maximum price');
      return;
    }
    // Both rules are enforced server-side (listing.service.ts); mirroring them
    // here names the field that's wrong instead of surfacing a generic 400.
    if (directSaleEnabled) {
      const retail = parseFloat(retailPrice);
      if (!(retail > 0)) {
        toast.error('Set a retail price, or turn off direct sale');
        return;
      }
      if (retail < parseFloat(priceMin)) {
        toast.error('Retail price cannot be below your bulk floor price');
        return;
      }
    }
    // Government MSP guard — warn (but don't block) when the floor is below
    // the official support price. Listings are ₹-native (like the MSP and
    // mandi anchors shown in this form), so the guard always applies.
    const msp = mspForCrop(cropName, unit);
    const floor = parseFloat(priceMin);
    if (msp != null && floor < msp) {
      const proceed = window.confirm(
        `The government MSP for ${cropName} is ${formatCurrency(msp, 'INR')} per ${unit.toLowerCase()}. ` +
          `Your floor of ${formatCurrency(floor, 'INR')} is below it — you may sell under the support price.\n\nList anyway?`,
      );
      if (!proceed) return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('cropName', cropName);
      if (cropVariety) formData.append('cropVariety', cropVariety);
      formData.append('quantity', quantity);
      formData.append('unit', unit);
      formData.append('qualityGrade', qualityGrade);
      formData.append('pricePerUnitMin', priceMin);
      formData.append('pricePerUnitMax', priceMax);
      // Platform money is ₹-native: prices are typed against ₹ MSP/mandi
      // anchors, so the lot is always stored in INR regardless of the
      // account's display currency.
      formData.append('currency', 'INR');
      if (harvestDate) formData.append('harvestDate', harvestDate);
      if (description) formData.append('description', description);
      formData.append('organic', String(organic));
      formData.append('directSaleEnabled', String(directSaleEnabled));
      if (directSaleEnabled) formData.append('retailPricePerUnit', retailPrice);
      formData.append('location', location);
      formData.append('country', user?.country || 'India');
      formData.append('state', state);
      // Standard-photo mode uploads nothing: with images[] empty, every
      // listing surface shows the crop's stock photo automatically.
      if (photoMode === 'own') {
        images.forEach((file) => formData.append('images', file));
      }

      if (isEditMode) {
        await api.put(`/listings/${editId}`, {
          cropName,
          cropVariety: cropVariety || undefined,
          quantity: parseFloat(quantity),
          unit,
          qualityGrade,
          pricePerUnitMin: parseFloat(priceMin),
          pricePerUnitMax: parseFloat(priceMax),
          currency: 'INR',
          harvestDate: harvestDate || undefined,
          description: description || undefined,
          organic,
          directSaleEnabled,
          // Only sent when the channel is on. The update schema treats this as
          // optional, so omitting it leaves the stored price untouched — which
          // is what should happen when a farmer closes the retail channel and
          // later reopens it.
          ...(directSaleEnabled && { retailPricePerUnit: parseFloat(retailPrice) }),
          location,
          country: user?.country || 'India',
          state,
        });
      } else {
        await api.post('/listings', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast.success(isEditMode ? 'Listing updated' : 'Lot published');
      navigate('/farmer/listings');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  }

  const currency = 'INR'; // preview matches what will be stored
  const priceMinNum = parseFloat(priceMin) || 0;
  const priceMaxNum = parseFloat(priceMax) || 0;
  const previewPriceLabel = priceMinNum && priceMaxNum
    ? `${formatCurrency(priceMinNum, currency)} – ${formatCurrency(priceMaxNum, currency)}`
    : '—';

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/farmer/listings" style={{ color: 'inherit', textDecoration: 'none' }}>Listings</Link>
        {' / '}{isEditMode ? 'Edit' : 'New'}
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Brief your <span className="cb-italic">agent.</span>
      </h1>
      <p className="cb-page-lede">Set crop, grade, price floor, walk-away. Your agent takes it from there.</p>

      <div className="cb-split" style={{ gap: 24, marginTop: 28 }}>
        <form onSubmit={handleSubmit} className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '4px 24px' }}>
            {/* Voice input. Renders nothing when the server reports it is
                unavailable, so the typed form below is never affected. Edit
                mode is excluded: dictating over an existing listing would
                overwrite fields the farmer already settled on. */}
            {!isEditMode && (
              <div style={{ paddingTop: 20 }}>
                <VoiceCaptureButton onDraft={applyVoiceDraft} />
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
                    Filled from your voice note — check every field before publishing.
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
                {/* The transcript verbatim, so the farmer can see exactly what
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
                    // Preserve a legacy / off-catalogue crop name when editing so it isn't silently blanked.
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
                placeholder="e.g., Basmati, Sharbati, 12.5% protein"
                value={cropVariety}
                onChange={(e) => setCropVariety(e.target.value)}
              />
            </Section>

            <Section title="Volume & grade">
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input
                  label="Quantity"
                  type="number"
                  placeholder="e.g., 50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
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
                <label className="cb-label">Quality grade</label>
                <div className="cb-pill-group">
                  {[
                    { v: 'A', label: 'A · Premium' },
                    { v: 'B', label: 'B · Standard' },
                    { v: 'C', label: 'C · Economy' },
                  ].map((g) => (
                    <button
                      key={g.v}
                      type="button"
                      className={`cb-pill ${qualityGrade === g.v ? 'active' : ''}`}
                      onClick={() => setQualityGrade(g.v)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Price · per unit">
              <p className="cb-field-hint" style={{ marginTop: 0 }}>
                Min = your floor price (won't sell below). Max = your ideal price.
              </p>
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input
                  label="Floor"
                  type="number"
                  placeholder="e.g., 2000"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  required
                />
                <Input
                  label="Ideal"
                  type="number"
                  placeholder="e.g., 2800"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  required
                />
              </div>
              {priceMinNum > 0 && priceMaxNum > 0 && (
                <div className="cb-range-track">
                  <div className="cb-range-fill" style={{ left: 0, right: 0 }} />
                  <div className="cb-range-marker" style={{ left: '0%' }} />
                  <div className="cb-range-marker" style={{ left: '100%' }} />
                </div>
              )}
            </Section>

            <Section title="Logistics">
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input
                  label="Location (city)"
                  placeholder="e.g., Nashik"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
                <div>
                  <label className="cb-label">State</label>
                  <select value={state} onChange={(e) => setState(e.target.value)} className="cb-input" required>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <Input
                label="Harvest date (optional)"
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
              />
            </Section>

            <Section title="Notes">
              <div>
                <label className="cb-label">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe quality, storage conditions, certifications..."
                  className="cb-input"
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={organic}
                  onChange={(e) => setOrganic(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--cb-forest)' }}
                />
                <span style={{ fontSize: 14 }}>Organic certified</span>
              </label>
            </Section>

            {/* The retail channel. Deliberately its own section rather than a
                checkbox next to "organic": it changes who can buy this lot and
                at what price, which is a bigger decision than a quality flag. */}
            <Section title="Sell directly to shoppers">
              <p className="cb-small" style={{ color: 'var(--cb-ink-3)', marginTop: -4 }}>
                Households buy any amount at a fixed price you set — no bidding, no waiting.
                Bulk buyers can still bid on whatever is left.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={directSaleEnabled}
                  onChange={(e) => setDirectSaleEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--cb-forest)' }}
                />
                <span style={{ fontSize: 14 }}>Open this lot to shoppers</span>
              </label>
              {directSaleEnabled && (
                <div>
                  <label className="cb-label">Retail price per {unit.toLowerCase()} (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={retailPrice}
                    onChange={(e) => setRetailPrice(e.target.value)}
                    placeholder="e.g. 45"
                    className="cb-input"
                  />
                  <p className="cb-field-hint">
                    Usually above your bulk floor — retail covers grading, packing and the last mile.
                  </p>
                </div>
              )}
            </Section>

            <Section title="Photos">
              {!isEditMode && (
                <div className="cb-pill-group">
                  <button
                    type="button"
                    className={`cb-pill ${photoMode === 'standard' ? 'active' : ''}`}
                    onClick={() => setPhotoMode('standard')}
                  >
                    Standard crop photo
                  </button>
                  <button
                    type="button"
                    className={`cb-pill ${photoMode === 'own' ? 'active' : ''}`}
                    onClick={() => setPhotoMode('own')}
                  >
                    Upload my own
                  </button>
                </div>
              )}
              {!isEditMode && photoMode === 'standard' ? (
                cropImageFor(cropName) ? (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img
                      src={cropImageFor(cropName)!}
                      alt={cropName}
                      style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--cb-line)' }}
                    />
                    <p className="cb-field-hint" style={{ margin: 0 }}>
                      Buyers will see this standard photo of {cropName}. No camera needed —
                      switch to “Upload my own” anytime for better trust.
                    </p>
                  </div>
                ) : (
                  <p className="cb-field-hint" style={{ margin: 0 }}>
                    {cropName
                      ? `No standard photo available for ${cropName} yet — buyers will see a placeholder. You can upload your own instead.`
                      : 'Select a crop above to preview its standard photo.'}
                  </p>
                )
              ) : (
                <ImageUploader images={images} onChange={setImages} maxImages={5} />
              )}
            </Section>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '20px 0' }}>
              <Button type="submit" size="lg" loading={loading || fetching}>
                {isEditMode ? 'Update listing' : 'Publish lot'}
                <ArrowIcon />
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => navigate('/farmer/listings')}>
                Cancel
              </Button>
            </div>
          </div>
        </form>

        <aside style={{ position: 'sticky', top: 76, alignSelf: 'flex-start' }}>
          <div className="cb-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span className="cb-live-dot sm" />
              <span className="cb-eyebrow">Live preview · will be public</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cb-ink)' }}>
              {cropName || 'Crop name'}
            </div>
            {cropVariety && (
              <div className="cb-small" style={{ marginTop: 2 }}>{cropVariety}</div>
            )}
            <div className="cb-tiny" style={{ marginTop: 6 }}>
              Grade {qualityGrade}{organic && ' · Organic'}
            </div>
            <div className="cb-mono" style={{ marginTop: 14, fontSize: 18, fontWeight: 500 }}>
              {previewPriceLabel}
            </div>
            <div className="cb-tiny" style={{ marginTop: 2 }}>per {unit.toLowerCase()}</div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--cb-line)' }}>
              <div className="cb-tiny">
                {quantity ? `${quantity} ${unit.toLowerCase()} available` : 'Quantity —'}
              </div>
              <div className="cb-tiny" style={{ marginTop: 2 }}>
                {location && state ? `${location}, ${state}` : 'Location —'}
              </div>
              {harvestDate && (
                <div className="cb-tiny" style={{ marginTop: 2 }}>
                  Harvest {new Date(harvestDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, padding: 12, background: 'var(--cb-paper-2)', borderRadius: 8 }}>
              <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Agent strategy</div>
              <div className="cb-small" style={{ fontSize: 12.5 }}>
                {priceMinNum > 0 && priceMaxNum > 0
                  ? `Open at ${formatCurrency(priceMinNum + (priceMaxNum - priceMinNum) * 0.1, currency)}, accept at ${formatCurrency(priceMaxNum - (priceMaxNum - priceMinNum) * 0.05, currency)}. Walk-away ${formatCurrency(priceMinNum, currency)}.`
                  : 'Set floor & ideal to preview agent strategy.'}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
