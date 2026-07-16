// =============================================================================
// OnboardingPage — Post-signup profile setup (step 2 of 2)
// =============================================================================
// Shown right after signup, before the user can reach a dashboard (enforced by
// ProtectedRoute). Renders a farmer OR buyer form based on user.role:
//   - Farmer: region, farm size, organic cert, crops grown, India compliance
//   - Buyer:  region, company name/type, tax id, annual volume
// Region options and tax-id labels adapt to the user's country. On submit it
// POSTs to /auth/onboarding/{farmer|buyer}, refreshes the user, and redirects.
//
// COUNTRY DATA: REGIONS_BY_COUNTRY and ALL_CROP_CATEGORIES are static lookup
// tables driving the region <select> and the crop picker.
// =============================================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
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
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>● Profile</div>
      <div style={{ width: 24, height: 1, background: 'var(--cb-line)' }} />
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>○ Live</div>
    </div>
  );
}

export function OnboardingPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [farmSize, setFarmSize] = useState('');
  const [state, setState] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [organic, setOrganic] = useState(false);
  const [fpoName, setFpoName] = useState('');
  const [apmcLicense, setApmcLicense] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState('PROCESSOR');
  const [taxId, setTaxId] = useState('');
  const [volume, setVolume] = useState('');

  function toggleCrop(crop: string) {
    setSelectedCrops((prev) => prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (user?.role === 'FARMER') {
        await api.post('/auth/onboarding/farmer', {
          farmSizeAcres: parseFloat(farmSize),
          cropsGrown: selectedCrops,
          state,
          organicCertified: organic,
          fpoName: fpoName || undefined,
          apmcLicense: apmcLicense || undefined,
        });
      } else {
        await api.post('/auth/onboarding/buyer', {
          companyName,
          companyType,
          taxId: taxId || undefined,
          annualProcurementVolume: volume || undefined,
        });
      }
      const { data } = await api.get('/auth/me');
      updateUser(data.user);
      toast.success('Profile activated');
      // Home is the marketplace storefront for every role
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  }

  const userCountry = user?.country || 'India';
  const regions = REGIONS_BY_COUNTRY[userCountry] || [];
  const regionLabel = ['United States', 'India', 'Brazil'].includes(userCountry) ? 'State'
    : userCountry === 'United Kingdom' ? 'Region' : 'Region';

  if (!user) return null;

  const isFarmer = user.role === 'FARMER';

  return (
    <div className="cb-app" style={{ minHeight: '100vh' }}>
      <header className="cb-auth-nav">
        <Link to="/" className="wordmark">
          <ArcMark size={22} />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <span className="cb-tiny">{user.name} · {user.role.toLowerCase()}</span>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px 64px' }}>
        <div className="cb-eyebrow">Onboarding · step 02 / 02</div>
        <Stepper />

        <h1 className="cb-h2" style={{ marginTop: 0 }}>
          {isFarmer ? (
            <>Calibrate your <span className="cb-italic">farm.</span></>
          ) : (
            <>Calibrate your <span className="cb-italic">company.</span></>
          )}
        </h1>
        <p className="cb-body" style={{ marginTop: 14, marginBottom: 28 }}>
          {isFarmer
            ? 'Your agent uses these signals to match buyers, set reserve prices, and surface auctions worth your time.'
            : 'Your agent uses these signals to find growers, brief negotiations, and price-anchor your bids.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
          </SectionCard>

          {isFarmer ? (
            <>
              <SectionCard title="Operation">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
          ) : (
            <>
              <SectionCard title="Company">
                <Input
                  label="Company name"
                  placeholder="e.g., Agri Foods Pvt Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
                <div>
                  <label className="cb-label">Company type</label>
                  <div className="cb-pill-group">
                    {[
                      ['PROCESSOR', 'Processor'],
                      ['FMCG', 'FMCG'],
                      ['RESTAURANT', 'Restaurant'],
                      ['EXPORTER', 'Exporter'],
                      ['RETAILER', 'Retailer'],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setCompanyType(v)}
                        className={`cb-pill ${companyType === v ? 'active' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <Link to={isFarmer ? '/farmer' : '/buyer'} className="cb-btn cb-btn-link">Skip for now</Link>
            <Button type="submit" size="lg" loading={loading}>
              Activate agent
              <ArrowIcon />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
