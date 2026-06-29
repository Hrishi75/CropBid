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
import { CROP_CATEGORIES } from '../../utils/crops';
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
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');

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
    // Government MSP guard — warn (but don't block) when the floor is below the
    // official support price for this crop.
    const msp = mspForCrop(cropName, unit);
    const floor = parseFloat(priceMin);
    const cur = user?.currency || 'INR';
    if (msp != null && floor < msp) {
      const proceed = window.confirm(
        `The government MSP for ${cropName} is ${formatCurrency(msp, cur)} per ${unit.toLowerCase()}. ` +
          `Your floor of ${formatCurrency(floor, cur)} is below it — you may sell under the support price.\n\nList anyway?`,
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
      formData.append('currency', user?.currency || 'INR');
      if (harvestDate) formData.append('harvestDate', harvestDate);
      if (description) formData.append('description', description);
      formData.append('organic', String(organic));
      formData.append('location', location);
      formData.append('country', user?.country || 'India');
      formData.append('state', state);
      images.forEach((file) => formData.append('images', file));

      if (isEditMode) {
        await api.put(`/listings/${editId}`, {
          cropName,
          cropVariety: cropVariety || undefined,
          quantity: parseFloat(quantity),
          unit,
          qualityGrade,
          pricePerUnitMin: parseFloat(priceMin),
          pricePerUnitMax: parseFloat(priceMax),
          currency: user?.currency || 'INR',
          harvestDate: harvestDate || undefined,
          description: description || undefined,
          organic,
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

  const currency = user?.currency || 'INR';
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 24, marginTop: 28 }}>
        <form onSubmit={handleSubmit} className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '4px 24px' }}>
            <Section title="Crop">
              <div>
                <label className="cb-label">Crop</label>
                <select value={cropName} onChange={(e) => setCropName(e.target.value)} className="cb-input" required>
                  <option value="">Select crop</option>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

            <Section title="Images">
              <ImageUploader images={images} onChange={setImages} maxImages={5} />
            </Section>

            <div style={{ display: 'flex', gap: 12, padding: '20px 0' }}>
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
