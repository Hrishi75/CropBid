import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
];

const COMMON_CROPS = [
  'Rice', 'Wheat', 'Cotton', 'Soybean', 'Sugarcane', 'Turmeric', 'Onion',
  'Tomato', 'Potato', 'Chana Dal', 'Mustard', 'Coffee', 'Tea', 'Pepper',
  'Groundnut', 'Coconut', 'Banana', 'Corn', 'Barley', 'Ragi',
];

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

              <div>
                <label className="block text-sm font-medium text-text mb-1">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-2">Crops Grown</label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_CROPS.map(crop => (
                    <button
                      key={crop}
                      type="button"
                      onClick={() => toggleCrop(crop)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors
                        ${selectedCrops.includes(crop)
                          ? 'bg-accent text-white'
                          : 'bg-surface-alt text-text-secondary hover:bg-surface-hover'
                        }`}
                    >
                      {crop}
                    </button>
                  ))}
                </div>
              </div>

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
              {user.country === 'India' && (
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
                label={user.country === 'India' ? 'GST Number (optional)' : 'Tax ID (optional)'}
                placeholder={user.country === 'India' ? 'e.g., 27AABCA1234A1ZA' : 'Tax identification number'}
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
