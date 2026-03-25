import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Region / state data by country
// ---------------------------------------------------------------------------
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
  'Thailand': [
    'Bangkok', 'Chiang Mai', 'Chiang Rai', 'Khon Kaen', 'Nakhon Ratchasima',
    'Nonthaburi', 'Pathum Thani', 'Phuket', 'Songkhla', 'Udon Thani',
  ],
  'Vietnam': [
    'Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hai Phong', 'Can Tho',
    'Lam Dong', 'Dak Lak', 'Gia Lai', 'Binh Duong', 'Dong Nai',
  ],
  'Indonesia': [
    'Bali', 'Banten', 'Central Java', 'East Java', 'Jakarta',
    'North Sumatra', 'South Sulawesi', 'West Java', 'West Kalimantan', 'Yogyakarta',
  ],
  'Ethiopia': [
    'Addis Ababa', 'Amhara', 'Oromia', 'Sidama', 'Somali',
    'South Ethiopia', 'South West Ethiopia', 'Tigray',
  ],
};

// ---------------------------------------------------------------------------
// Comprehensive crop catalogue — organised by category with emoji icons
// ---------------------------------------------------------------------------
interface CropCategory {
  name: string;
  icon: string;
  crops: string[];
}

const ALL_CROP_CATEGORIES: CropCategory[] = [
  {
    name: 'Cereals & Grains',
    icon: '🌾',
    crops: [
      'Rice', 'Wheat', 'Corn (Maize)', 'Barley', 'Oats', 'Ragi (Finger Millet)',
      'Sorghum (Jowar)', 'Pearl Millet (Bajra)', 'Foxtail Millet', 'Buckwheat', 'Quinoa',
    ],
  },
  {
    name: 'Pulses & Legumes',
    icon: '🫘',
    crops: [
      'Chana Dal (Chickpea)', 'Toor Dal (Pigeon Pea)', 'Moong Dal (Green Gram)',
      'Urad Dal (Black Gram)', 'Masoor Dal (Red Lentil)', 'Kidney Bean (Rajma)',
      'Soybean', 'Groundnut (Peanut)', 'Black-Eyed Pea (Lobia)', 'Horse Gram',
    ],
  },
  {
    name: 'Cash Crops',
    icon: '💰',
    crops: [
      'Cotton', 'Sugarcane', 'Jute', 'Tobacco', 'Rubber', 'Coffee', 'Tea',
      'Cocoa', 'Vanilla', 'Saffron',
    ],
  },
  {
    name: 'Oilseeds',
    icon: '🫒',
    crops: [
      'Mustard', 'Sunflower', 'Sesame (Til)', 'Castor', 'Linseed (Flax)',
      'Safflower', 'Niger Seed', 'Palm Oil', 'Rapeseed (Canola)', 'Olive',
    ],
  },
  {
    name: 'Spices & Condiments',
    icon: '🌶️',
    crops: [
      'Turmeric', 'Black Pepper', 'Chili', 'Cardamom', 'Cumin (Jeera)',
      'Coriander', 'Ginger', 'Garlic', 'Cinnamon', 'Clove',
      'Nutmeg', 'Fenugreek (Methi)', 'Fennel (Saunf)', 'Star Anise',
    ],
  },
  {
    name: 'Vegetables',
    icon: '🥬',
    crops: [
      'Tomato', 'Potato', 'Onion', 'Cauliflower', 'Cabbage', 'Broccoli',
      'Spinach', 'Okra (Bhindi)', 'Eggplant (Brinjal)', 'Bitter Gourd (Karela)',
      'Bottle Gourd (Lauki)', 'Pumpkin', 'Carrot', 'Radish', 'Beetroot',
      'Green Peas', 'Sweet Potato', 'Cassava (Tapioca)', 'Lettuce', 'Bell Pepper',
      'Cucumber', 'Drumstick (Moringa)', 'Yam', 'Taro (Arbi)',
    ],
  },
  {
    name: 'Fruits',
    icon: '🍎',
    crops: [
      'Mango', 'Banana', 'Apple', 'Orange', 'Grapes', 'Papaya', 'Guava',
      'Pomegranate', 'Watermelon', 'Pineapple', 'Lychee', 'Coconut',
      'Strawberry', 'Blueberry', 'Avocado', 'Dragon Fruit', 'Kiwi',
      'Citrus (Lemon/Lime)', 'Jackfruit', 'Sapota (Chikoo)', 'Fig', 'Date',
      'Passion Fruit', 'Custard Apple', 'Peach', 'Plum', 'Cherry',
    ],
  },
  {
    name: 'Nuts & Dry Fruits',
    icon: '🥜',
    crops: [
      'Cashew', 'Almond', 'Walnut', 'Pistachio', 'Macadamia', 'Pecan',
      'Hazelnut', 'Arecanut (Betel Nut)', 'Pine Nut',
    ],
  },
  {
    name: 'Flowers & Aromatics',
    icon: '🌸',
    crops: [
      'Marigold', 'Rose', 'Jasmine', 'Tuberose', 'Chrysanthemum',
      'Lavender', 'Lemongrass', 'Mint', 'Basil (Tulsi)',
    ],
  },
  {
    name: 'Fibre & Fodder',
    icon: '🧵',
    crops: [
      'Hay', 'Alfalfa', 'Napier Grass', 'Hemp', 'Kenaf', 'Sisal', 'Coir (Coconut Fibre)',
    ],
  },
];

// ---------------------------------------------------------------------------
// Two-step crop picker: Category dropdown -> Crop selector
// ---------------------------------------------------------------------------
function CropPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (crop: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState('');

  const currentCat = ALL_CROP_CATEGORIES.find(c => c.name === activeCategory);

  // Count selected per category for badges
  function countSelected(cat: CropCategory) {
    return cat.crops.filter(c => selected.includes(c)).length;
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-text">
        Crops Grown
        {selected.length > 0 && (
          <span className="ml-2 text-xs font-normal text-accent">
            {selected.length} selected
          </span>
        )}
      </label>

      {/* Selected crop chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-surface-alt border border-border/60 max-h-28 overflow-y-auto">
          {selected.map(crop => (
            <span
              key={crop}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/15 text-accent border border-accent/30 animate-in"
            >
              {crop}
              <button
                type="button"
                onClick={() => onToggle(crop)}
                className="ml-0.5 hover:text-error transition-colors text-base leading-none"
                aria-label={`Remove ${crop}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Step 1: Category dropdown */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Category</label>
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        >
          <option value="">Select a crop category</option>
          {ALL_CROP_CATEGORIES.map(cat => {
            const n = countSelected(cat);
            return (
              <option key={cat.name} value={cat.name}>
                {cat.icon} {cat.name} ({cat.crops.length} crops){n > 0 ? ` — ${n} selected` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Step 2: Crop grid for selected category */}
      {currentCat && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-3 py-2 bg-surface-alt border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {currentCat.icon} {currentCat.name}
            </span>
            <span className="text-xs text-text-muted">
              {countSelected(currentCat)}/{currentCat.crops.length} selected
            </span>
          </div>
          <div className="p-2.5 flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {currentCat.crops.map(crop => {
              const isSelected = selected.includes(crop);
              return (
                <button
                  key={crop}
                  type="button"
                  onClick={() => onToggle(crop)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border
                    ${isSelected
                      ? 'bg-accent text-white border-accent shadow-sm scale-[1.02]'
                      : 'bg-surface text-text-secondary border-border hover:border-accent hover:text-accent hover:bg-accent/5'
                    }`}
                >
                  {isSelected && (
                    <svg className="inline w-3.5 h-3.5 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {crop}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hint when nothing selected */}
      {!activeCategory && selected.length === 0 && (
        <p className="text-xs text-text-muted text-center py-1">
          Pick a category above to start selecting your crops
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding page
// ---------------------------------------------------------------------------
export function OnboardingPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Farmer fields
  const [farmSize, setFarmSize] = useState('');
  const [state, setState] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [organic, setOrganic] = useState(false);
  const [fpoName, setFpoName] = useState('');
  const [apmcLicense, setApmcLicense] = useState('');

  // Buyer fields
  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState('PROCESSOR');
  const [taxId, setTaxId] = useState('');
  const [volume, setVolume] = useState('');

  function toggleCrop(crop: string) {
    setSelectedCrops(prev =>
      prev.includes(crop) ? prev.filter(c => c !== crop) : [...prev, crop]
    );
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

      // Refresh user data to include the new profile
      const { data } = await api.get('/auth/me');
      updateUser(data.user);

      toast.success('Profile completed!');
      navigate(user?.role === 'FARMER' ? '/farmer' : '/buyer');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  }

  const userCountry = user?.country || 'India';
  const regions = REGIONS_BY_COUNTRY[userCountry] || [];
  const regionLabel = userCountry === 'United States' ? 'State' :
    userCountry === 'United Kingdom' ? 'Region' :
    userCountry === 'Brazil' ? 'State' :
    userCountry === 'India' ? 'State' : 'Region';

  if (!user) return null;

  return (
    <div className="min-h-screen bg-surface-alt flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg" padding="lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">
            {user.role === 'FARMER' ? '🧑‍🌾 Complete Your Farm Profile' : '🏢 Complete Your Company Profile'}
          </h1>
          <p className="text-text-secondary mt-1">
            This helps us match you with the right {user.role === 'FARMER' ? 'buyers' : 'farmers'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Country badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-alt border border-border">
            <span className="text-sm text-text-secondary">Country:</span>
            <span className="text-sm font-medium text-text">{userCountry}</span>
            <span className="ml-auto text-xs text-text-muted">Selected during signup</span>
          </div>

          {/* Region/State — shared by both farmer and buyer */}
          <div>
            <label className="block text-sm font-medium text-text mb-1">{regionLabel}</label>
            {regions.length > 0 ? (
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                required
              >
                <option value="">Select {regionLabel.toLowerCase()}</option>
                {regions.map(s => (
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

          {user.role === 'FARMER' ? (
            <>
              <Input
                label="Farm Size (acres)"
                type="number"
                placeholder="e.g., 15"
                value={farmSize}
                onChange={(e) => setFarmSize(e.target.value)}
                required
              />

              {/* Searchable crop picker */}
              <CropPicker selected={selectedCrops} onToggle={toggleCrop} />

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={organic}
                  onChange={(e) => setOrganic(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm text-text">Organic Certified</span>
              </label>

              {/* India-specific fields */}
              {userCountry === 'India' && (
                <>
                  <Input
                    label="FPO Affiliation (optional)"
                    placeholder="Farmer Producer Organization name"
                    value={fpoName}
                    onChange={(e) => setFpoName(e.target.value)}
                  />
                  <Input
                    label="APMC License (optional)"
                    placeholder="e.g., MH-APMC-2024-1234"
                    value={apmcLicense}
                    onChange={(e) => setApmcLicense(e.target.value)}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <Input
                label="Company Name"
                placeholder="e.g., Agri Foods Pvt Ltd"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />

              <div>
                <label className="block text-sm font-medium text-text mb-1">Company Type</label>
                <select
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                >
                  <option value="PROCESSOR">Food Processor</option>
                  <option value="FMCG">FMCG Company</option>
                  <option value="RESTAURANT">Restaurant Chain</option>
                  <option value="EXPORTER">Exporter</option>
                  <option value="RETAILER">Retailer</option>
                </select>
              </div>

              <Input
                label={
                  userCountry === 'India' ? 'GST Number (optional)' :
                  userCountry === 'United States' ? 'EIN (optional)' :
                  ['Germany', 'France', 'Netherlands', 'United Kingdom'].includes(userCountry) ? 'VAT Number (optional)' :
                  'Tax ID (optional)'
                }
                placeholder={
                  userCountry === 'India' ? 'e.g., 27AABCA1234A1ZA' :
                  userCountry === 'United States' ? 'e.g., 12-3456789' :
                  'Tax identification number'
                }
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />

              <Input
                label="Annual Procurement Volume (optional)"
                placeholder="e.g., 5000-10000 tonnes"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
              />
            </>
          )}

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Complete Profile
          </Button>
        </form>
      </Card>
    </div>
  );
}
