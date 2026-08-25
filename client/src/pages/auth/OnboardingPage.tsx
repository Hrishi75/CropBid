// =============================================================================
// OnboardingPage — the PARTNER APPLICATION form (step 2 of 3)
// =============================================================================
// Shown right after a partner creates their account, and again when a
// reviewer sends the application back (NEEDS_INFO) or rejects it. Renders a
// seller OR buyer form based on user.role:
//   - Seller (role FARMER): subtype pills — Farmer / Local shop / Wholesaler —
//     and the sections swap with the choice. A farmer fills acreage and crops;
//     a shop fills shop name, type, address and FSSAI; a wholesaler fills firm
//     name, GSTIN, minimums and lead time.
//   - Buyer: company type pills (restaurant / small business / wholesaler /
//     the legacy corporate types) + company details.
//
// Submitting files the application (status SUBMITTED) and lands on
// /partner/status. NOTHING here unlocks a dashboard — an admin does that from
// the review queue.
//
// The subtype arrives from /partner via sessionStorage (PARTNER_TYPE_KEY,
// "FARMER:LOCAL_SHOP") but is changeable here — the landing-page choice is a
// preselection, not a commitment.
//
// COUNTRY DATA: REGIONS_BY_COUNTRY and ALL_CROP_CATEGORIES are static lookup
// tables driving the region <select> and the crop picker.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import { PARTNER_TYPE_KEY } from './SignupPage';
import { SELLER_TYPE_LABEL, SHOP_TYPE_OPTIONS } from '../../utils/partner';
import type { CompanyType, SellerType } from '../../types';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  'India': [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
  ],
  'United States': [
    'Alabama', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Florida',
    'Georgia', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
    'Louisiana', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
    'Nebraska', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma',
    'Oregon', 'Pennsylvania', 'South Carolina', 'South Dakota', 'Tennessee',
    'Texas', 'Virginia', 'Washington', 'Wisconsin',
  ],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'Germany': [
    'Baden-Württemberg', 'Bavaria', 'Brandenburg', 'Hesse', 'Lower Saxony',
    'Mecklenburg-Vorpommern', 'North Rhine-Westphalia', 'Rhineland-Palatinate',
    'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia',
  ],
  'France': [
    'Île-de-France', 'Auvergne-Rhône-Alpes', 'Nouvelle-Aquitaine', 'Occitanie',
    'Hauts-de-France', 'Grand Est', 'Provence-Alpes-Côte d\'Azur', 'Pays de la Loire',
    'Bretagne', 'Normandie', 'Bourgogne-Franche-Comté', 'Centre-Val de Loire',
  ],
  'Netherlands': [
    'Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen',
    'Limburg', 'North Brabant', 'North Holland', 'Overijssel',
    'South Holland', 'Utrecht', 'Zeeland',
  ],
  'Brazil': [
    'Bahia', 'Goiás', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais',
    'Paraná', 'Rio Grande do Sul', 'Santa Catarina', 'São Paulo',
  ],
  'Kenya': ['Central', 'Coast', 'Eastern', 'Nairobi', 'Nyanza', 'Rift Valley', 'Western'],
  'Nigeria': ['Benue', 'Cross River', 'Kaduna', 'Kano', 'Lagos', 'Niger', 'Ogun', 'Oyo'],
  'Australia': ['New South Wales', 'Queensland', 'South Australia', 'Victoria', 'Western Australia'],
  'UAE': ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain'],
  'Thailand': ['Bangkok', 'Chiang Mai', 'Chiang Rai', 'Khon Kaen', 'Nakhon Ratchasima', 'Nonthaburi', 'Pathum Thani', 'Phuket', 'Songkhla', 'Udon Thani'],
  'Vietnam': ['Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hai Phong', 'Can Tho', 'Lam Dong', 'Dak Lak', 'Gia Lai', 'Binh Duong', 'Dong Nai'],
  'Indonesia': ['Bali', 'Banten', 'Central Java', 'East Java', 'Jakarta', 'North Sumatra', 'South Sulawesi', 'West Java', 'West Kalimantan', 'Yogyakarta'],
  'Ethiopia': ['Addis Ababa', 'Amhara', 'Oromia', 'Sidama', 'Somali', 'South Ethiopia', 'South West Ethiopia', 'Tigray'],
};

interface CropCategory {
  name: string;
  icon: string;
  crops: string[];
}

const ALL_CROP_CATEGORIES: CropCategory[] = [
  { name: 'Cereals & Grains', icon: '🌾', crops: ['Rice', 'Wheat', 'Corn (Maize)', 'Barley', 'Oats', 'Ragi (Finger Millet)', 'Sorghum (Jowar)', 'Pearl Millet (Bajra)', 'Foxtail Millet', 'Buckwheat', 'Quinoa'] },
  { name: 'Pulses & Legumes', icon: '🫘', crops: ['Chana Dal (Chickpea)', 'Toor Dal (Pigeon Pea)', 'Moong Dal (Green Gram)', 'Urad Dal (Black Gram)', 'Masoor Dal (Red Lentil)', 'Kidney Bean (Rajma)', 'Soybean', 'Groundnut (Peanut)', 'Black-Eyed Pea (Lobia)', 'Horse Gram'] },
  { name: 'Cash Crops', icon: '💰', crops: ['Cotton', 'Sugarcane', 'Jute', 'Tobacco', 'Rubber', 'Coffee', 'Tea', 'Cocoa', 'Vanilla', 'Saffron'] },
  { name: 'Oilseeds', icon: '🫒', crops: ['Mustard', 'Sunflower', 'Sesame (Til)', 'Castor', 'Linseed (Flax)', 'Safflower', 'Niger Seed', 'Palm Oil', 'Rapeseed (Canola)', 'Olive'] },
  { name: 'Spices & Condiments', icon: '🌶️', crops: ['Turmeric', 'Black Pepper', 'Chili', 'Cardamom', 'Cumin (Jeera)', 'Coriander', 'Ginger', 'Garlic', 'Cinnamon', 'Clove', 'Nutmeg', 'Fenugreek (Methi)', 'Fennel (Saunf)', 'Star Anise'] },
  { name: 'Vegetables', icon: '🥬', crops: ['Tomato', 'Potato', 'Onion', 'Cauliflower', 'Cabbage', 'Broccoli', 'Spinach', 'Okra (Bhindi)', 'Eggplant (Brinjal)', 'Bitter Gourd (Karela)', 'Bottle Gourd (Lauki)', 'Pumpkin', 'Carrot', 'Radish', 'Beetroot', 'Green Peas', 'Sweet Potato', 'Cassava (Tapioca)', 'Lettuce', 'Bell Pepper', 'Cucumber', 'Drumstick (Moringa)', 'Yam', 'Taro (Arbi)'] },
  { name: 'Fruits', icon: '🍎', crops: ['Mango', 'Banana', 'Apple', 'Orange', 'Grapes', 'Papaya', 'Guava', 'Pomegranate', 'Watermelon', 'Pineapple', 'Lychee', 'Coconut', 'Strawberry', 'Blueberry', 'Avocado', 'Dragon Fruit', 'Kiwi', 'Citrus (Lemon/Lime)', 'Jackfruit', 'Sapota (Chikoo)', 'Fig', 'Date', 'Passion Fruit', 'Custard Apple', 'Peach', 'Plum', 'Cherry'] },
  { name: 'Nuts & Dry Fruits', icon: '🥜', crops: ['Cashew', 'Almond', 'Walnut', 'Pistachio', 'Macadamia', 'Pecan', 'Hazelnut', 'Arecanut (Betel Nut)', 'Pine Nut'] },
  { name: 'Flowers & Aromatics', icon: '🌸', crops: ['Marigold', 'Rose', 'Jasmine', 'Tuberose', 'Chrysanthemum', 'Lavender', 'Lemongrass', 'Mint', 'Basil (Tulsi)'] },
  { name: 'Fibre & Fodder', icon: '🧵', crops: ['Hay', 'Alfalfa', 'Napier Grass', 'Hemp', 'Kenaf', 'Sisal', 'Coir (Coconut Fibre)'] },
];

function SectionCard({ title, optional, children }: { title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="cb-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="cb-eyebrow">
        {title}{optional && <span style={{ marginLeft: 8, color: 'var(--cb-ink-3)' }}>· optional</span>}
      </div>
      {children}
    </div>
  );
}

function CropPicker({ selected, onToggle }: { selected: string[]; onToggle: (crop: string) => void }) {
  const [activeCategory, setActiveCategory] = useState('');
  const currentCat = ALL_CROP_CATEGORIES.find((c) => c.name === activeCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map((crop) => (
            <span key={crop} className="cb-chip cb-chip-sage" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--cb-font-sans)' }}>
              {crop}
              <button
                type="button"
                onClick={() => onToggle(crop)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
                aria-label={`Remove ${crop}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div>
        <label className="cb-label">Category</label>
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          className="cb-input"
        >
          <option value="">Select a crop category</option>
          {ALL_CROP_CATEGORIES.map((cat) => {
            const n = cat.crops.filter((c) => selected.includes(c)).length;
            return (
              <option key={cat.name} value={cat.name}>
                {cat.icon} {cat.name} ({cat.crops.length}){n > 0 ? ` · ${n} selected` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {currentCat && (
        <div className="cb-pill-group">
          {currentCat.crops.map((crop) => {
            const isSel = selected.includes(crop);
            return (
              <button
                key={crop}
                type="button"
                onClick={() => onToggle(crop)}
                className={`cb-pill ${isSel ? 'active' : ''}`}
              >
                {isSel && <span style={{ marginRight: 4 }}>✓</span>}
                {crop}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stepper() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-forest)' }}>● Account</div>
      <div style={{ width: 24, height: 1, background: 'var(--cb-forest)' }} />
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>● Application</div>
      <div style={{ width: 24, height: 1, background: 'var(--cb-line)' }} />
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>○ Review</div>
    </div>
  );
}

// Buyer company types, prominent ones first — the three from the partner
// landing lead, the legacy corporate types follow.
const BUYER_TYPE_PILLS: { value: CompanyType; label: string }[] = [
  { value: 'RESTAURANT', label: 'Restaurant / café' },
  { value: 'SMALL_BUSINESS', label: 'Small business' },
  { value: 'WHOLESALER', label: 'Wholesaler' },
  { value: 'PROCESSOR', label: 'Processor' },
  { value: 'FMCG', label: 'FMCG' },
  { value: 'EXPORTER', label: 'Exporter' },
  { value: 'RETAILER', label: 'Retailer' },
];

// What /partner put in sessionStorage, e.g. "FARMER:LOCAL_SHOP".
function partnerTypeHint(): { role: string; type: string } | null {
  try {
    const raw = sessionStorage.getItem(PARTNER_TYPE_KEY);
    if (!raw || !raw.includes(':')) return null;
    const [role, type] = raw.split(':');
    return { role, type };
  } catch {
    return null;
  }
}

export function OnboardingPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const hint = partnerTypeHint();
  const isFarmer = user?.role === 'FARMER';

  // Resubmission: when a reviewer sent the application back, the same form
  // reopens with the previous answers in place and the note on top.
  const existingSeller = isFarmer ? user?.farmerProfile : null;
  const existingBuyer = !isFarmer ? user?.buyerProfile : null;
  const existing = existingSeller || existingBuyer || null;
  const isResubmit = !!existing && (existing.status === 'NEEDS_INFO' || existing.status === 'REJECTED');

  // --- Seller state ---
  const [sellerType, setSellerType] = useState<SellerType>(
    existingSeller?.sellerType
    || (hint?.role === 'FARMER' && ['FARMER', 'LOCAL_SHOP', 'WHOLESALER'].includes(hint.type) ? hint.type as SellerType : 'FARMER')
  );
  const [farmSize, setFarmSize] = useState(existingSeller?.farmSizeAcres?.toString() || '');
  const [state, setState] = useState(existingSeller?.state || '');
  const [selectedCrops, setSelectedCrops] = useState<string[]>(existingSeller?.cropsGrown || []);
  const [organic, setOrganic] = useState(existingSeller?.organicCertified || false);
  const [fpoName, setFpoName] = useState(existingSeller?.fpoName || '');
  const [apmcLicense, setApmcLicense] = useState(existingSeller?.apmcLicense || '');
  const [businessName, setBusinessName] = useState(existingSeller?.businessName || '');
  const [shopType, setShopType] = useState(existingSeller?.shopType || 'KIRANA');
  const [address, setAddress] = useState(existingSeller?.address || '');
  const [fssai, setFssai] = useState(existingSeller?.fssaiLicense || '');
  const [gstin, setGstin] = useState(existingSeller?.gstin || '');
  const [minOrderValue, setMinOrderValue] = useState(existingSeller?.minOrderValue?.toString() || '');
  const [leadTimeDays, setLeadTimeDays] = useState(existingSeller?.leadTimeDays?.toString() || '');

  // --- Buyer state ---
  const [companyName, setCompanyName] = useState(existingBuyer?.companyName || '');
  const [companyType, setCompanyType] = useState<CompanyType>(
    existingBuyer?.companyType
    || (hint?.role === 'BUYER' && BUYER_TYPE_PILLS.some((p) => p.value === hint.type) ? hint.type as CompanyType : 'RESTAURANT')
  );
  const [taxId, setTaxId] = useState(existingBuyer?.taxId || '');
  const [volume, setVolume] = useState(existingBuyer?.annualProcurementVolume || '');
  const [outletCount, setOutletCount] = useState(existingBuyer?.outletCount?.toString() || '');

  // An application that's already waiting (or approved) has nothing to do
  // here — the status page or dashboard owns those states.
  useEffect(() => {
    if (!existing) return;
    if (!isResubmit) {
      navigate(existing.status === 'APPROVED' ? '/' : '/partner/status', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCrop(crop: string) {
    setSelectedCrops((prev) => prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isFarmer) {
        await api.post('/auth/onboarding/farmer', {
          sellerType,
          state,
          // Per-type payload: only send what the chosen type actually uses,
          // so a shop application doesn't carry a stale farm size.
          ...(sellerType === 'FARMER' ? {
            farmSizeAcres: parseFloat(farmSize),
            cropsGrown: selectedCrops,
            organicCertified: organic,
            fpoName: fpoName || undefined,
            apmcLicense: apmcLicense || undefined,
          } : {}),
          ...(sellerType === 'LOCAL_SHOP' ? {
            businessName,
            shopType,
            address,
            fssaiLicense: fssai,
            gstin: gstin || undefined,
            cropsGrown: selectedCrops,
          } : {}),
          ...(sellerType === 'WHOLESALER' ? {
            businessName,
            gstin,
            apmcLicense: apmcLicense || undefined,
            address: address || undefined,
            cropsGrown: selectedCrops,
            minOrderValue: minOrderValue ? parseFloat(minOrderValue) : undefined,
            leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : undefined,
          } : {}),
        });
      } else {
        await api.post('/auth/onboarding/buyer', {
          companyName,
          companyType,
          taxId: taxId || undefined,
          annualProcurementVolume: volume || undefined,
          outletCount: companyType === 'RESTAURANT' && outletCount ? parseInt(outletCount, 10) : undefined,
        });
      }
      const { data } = await api.get('/auth/me');
      updateUser(data.user);
      toast.success(isResubmit ? 'Application resubmitted' : 'Application submitted');
      navigate('/partner/status');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  }

  const userCountry = user?.country || 'India';
  const regions = REGIONS_BY_COUNTRY[userCountry] || [];
  const regionLabel = 'State';

  if (!user) return null;

  const isShop = isFarmer && sellerType === 'LOCAL_SHOP';
  const isWholesale = isFarmer && sellerType === 'WHOLESALER';

  const reviewerNote = isResubmit ? existing?.statusNote : null;

  return (
    <div className="cb-app" style={{ minHeight: '100vh' }}>
      <header className="cb-auth-nav">
        <Link to="/" className="wordmark">
          <ArcMark size={22} />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <span className="cb-tiny">{user.name}</span>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px 64px' }}>
        <div className="cb-eyebrow">Partner application · step 02 / 03</div>
        <Stepper />

        <h1 className="cb-h2" style={{ marginTop: 0 }}>
          {isResubmit ? (
            <>Round two — <span className="cb-italic">let's fix it.</span></>
          ) : isFarmer ? (
            <>Tell us what <span className="cb-italic">you sell.</span></>
          ) : (
            <>Tell us what <span className="cb-italic">you buy.</span></>
          )}
        </h1>
        <p className="cb-body" style={{ marginTop: 14, marginBottom: 20 }}>
          {isResubmit
            ? 'Update the answers below and resubmit — the reviewer picks it up from where you left off.'
            : 'This goes to our review team, usually back to you within 24–48 hours. Licences speed it up; missing ones slow it down.'}
        </p>

        {reviewerNote && (
          <div className="cb-card" style={{ padding: 18, borderLeft: '3px solid var(--cb-ember)', marginBottom: 20 }}>
            <div className="cb-eyebrow" style={{ marginBottom: 6 }}>From the reviewer</div>
            <p className="cb-small" style={{ margin: 0 }}>{reviewerNote}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isFarmer && (
            <SectionCard title="I sell as a">
              <div className="cb-pill-group">
                {(Object.keys(SELLER_TYPE_LABEL) as SellerType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSellerType(t)}
                    className={`cb-pill ${sellerType === t ? 'active' : ''}`}
                  >
                    {SELLER_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                {sellerType === 'FARMER' && 'You grow what you sell. Second-day delivery tier.'}
                {sellerType === 'LOCAL_SHOP' && 'You hold same-day stock for your neighbourhood. Needs an FSSAI licence.'}
                {sellerType === 'WHOLESALER' && 'You move bulk with minimum orders. Needs a GSTIN.'}
              </div>
            </SectionCard>
          )}

          {!isFarmer && (
            <SectionCard title="Business type">
              <div className="cb-pill-group">
                {BUYER_TYPE_PILLS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setCompanyType(p.value)}
                    className={`cb-pill ${companyType === p.value ? 'active' : ''}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {isFarmer && (
            <SectionCard title="Location">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--cb-line)' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{userCountry}</span>
                <span className="cb-tiny" style={{ marginLeft: 'auto' }}>locked at signup</span>
              </div>
              <div>
                <label htmlFor="region-select" className="cb-label">{regionLabel}</label>
                {regions.length > 0 ? (
                  <select
                    id="region-select"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="cb-input"
                    required
                  >
                    <option value="">Select {regionLabel.toLowerCase()}</option>
                    {regions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    placeholder={`Enter your ${regionLabel.toLowerCase()}`}
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                  />
                )}
              </div>
              {(isShop || isWholesale) && (
                <Input
                  label={isShop ? 'Shop address' : 'Godown / office address'}
                  placeholder="Street, area, city"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required={isShop}
                />
              )}
            </SectionCard>
          )}

          {/* ---------------- FARMER ---------------- */}
          {isFarmer && sellerType === 'FARMER' && (
            <>
              <SectionCard title="Operation">
                <div className="cb-form-grid-2">
                  <Input
                    label="Farm size (acres)"
                    type="number"
                    placeholder="e.g., 15"
                    value={farmSize}
                    onChange={(e) => setFarmSize(e.target.value)}
                    required
                  />
                  <div>
                    <label className="cb-label">Organic cert</label>
                    <button
                      type="button"
                      onClick={() => setOrganic((v) => !v)}
                      className={`cb-pill ${organic ? 'active' : ''}`}
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                    >
                      {organic ? '✓ Certified' : '○ Not certified'}
                    </button>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title={`Crops · ${selectedCrops.length} selected`}>
                <CropPicker selected={selectedCrops} onToggle={toggleCrop} />
              </SectionCard>

              {userCountry === 'India' && (
                <SectionCard title="Compliance" optional>
                  <Input
                    label="FPO affiliation"
                    placeholder="Farmer Producer Organization name"
                    value={fpoName}
                    onChange={(e) => setFpoName(e.target.value)}
                  />
                  <Input
                    label="APMC license"
                    placeholder="e.g., MH-APMC-2024-1234"
                    value={apmcLicense}
                    onChange={(e) => setApmcLicense(e.target.value)}
                  />
                </SectionCard>
              )}
            </>
          )}

          {/* ---------------- LOCAL SHOP ---------------- */}
          {isShop && (
            <>
              <SectionCard title="Your shop">
                <Input
                  label="Shop name"
                  placeholder="As your customers know it"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
                <div>
                  <label className="cb-label">Shop type</label>
                  <div className="cb-pill-group">
                    {SHOP_TYPE_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setShopType(o.value)}
                        className={`cb-pill ${shopType === o.value ? 'active' : ''}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Licences">
                <Input
                  label="FSSAI licence number"
                  placeholder="14-digit FSSAI number"
                  value={fssai}
                  onChange={(e) => setFssai(e.target.value)}
                  required
                />
                <Input
                  label="GSTIN (optional)"
                  placeholder="e.g., 27AABCA1234A1ZA"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                />
                <p className="cb-field-hint">
                  Food sold to homes must trace to a licence — reviewers check this first.
                </p>
              </SectionCard>

              <SectionCard title={`What you stock · ${selectedCrops.length} selected`} optional>
                <CropPicker selected={selectedCrops} onToggle={toggleCrop} />
              </SectionCard>
            </>
          )}

          {/* ---------------- WHOLESALER ---------------- */}
          {isWholesale && (
            <>
              <SectionCard title="Your firm">
                <Input
                  label="Firm name"
                  placeholder="Registered trade name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
                <Input
                  label="GSTIN"
                  placeholder="e.g., 27AABCA1234A1ZA"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  required
                />
                <Input
                  label="APMC / mandi licence (optional)"
                  placeholder="e.g., MH-APMC-2024-1234"
                  value={apmcLicense}
                  onChange={(e) => setApmcLicense(e.target.value)}
                />
              </SectionCard>

              <SectionCard title="Trade terms">
                <div className="cb-form-grid-2">
                  <Input
                    label="Minimum order value (₹)"
                    type="number"
                    placeholder="e.g., 5000"
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(e.target.value)}
                  />
                  <Input
                    label="Lead time (days)"
                    type="number"
                    placeholder="e.g., 2"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                  />
                </div>
                <p className="cb-field-hint">
                  Buyers see these before ordering — honest numbers mean fewer cancellations.
                </p>
              </SectionCard>

              <SectionCard title={`Categories you trade · ${selectedCrops.length} selected`} optional>
                <CropPicker selected={selectedCrops} onToggle={toggleCrop} />
              </SectionCard>
            </>
          )}

          {/* ---------------- BUYER ---------------- */}
          {!isFarmer && (
            <>
              <SectionCard title="Company">
                <Input
                  label="Company name"
                  placeholder="e.g., Agri Foods Pvt Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
                {companyType === 'RESTAURANT' && (
                  <Input
                    label="Number of outlets (optional)"
                    type="number"
                    placeholder="e.g., 6"
                    value={outletCount}
                    onChange={(e) => setOutletCount(e.target.value)}
                  />
                )}
              </SectionCard>

              <SectionCard title="Tax" optional>
                <Input
                  label={
                    userCountry === 'India' ? 'GST number'
                      : userCountry === 'United States' ? 'EIN'
                        : ['Germany', 'France', 'Netherlands', 'United Kingdom'].includes(userCountry) ? 'VAT number'
                          : 'Tax ID'
                  }
                  placeholder={
                    userCountry === 'India' ? 'e.g., 27AABCA1234A1ZA'
                      : userCountry === 'United States' ? 'e.g., 12-3456789'
                        : 'Tax identification number'
                  }
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </SectionCard>

              <SectionCard title="Volume" optional>
                <Input
                  label="Annual procurement volume"
                  placeholder="e.g., 5000-10000 tonnes"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                />
              </SectionCard>
            </>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
            <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 'auto' }}>
              Reviewed by hand · 24–48h
            </span>
            <Button type="submit" size="lg" loading={loading}>
              {isResubmit ? 'Resubmit application' : 'Submit for review'}
              <ArrowIcon />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
