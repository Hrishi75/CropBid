import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { NegotiationStylePicker } from '../../components/agent/NegotiationStylePicker';
import { AgentStatusBadge } from '../../components/agent/AgentStatusBadge';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { AgentConfig, NegotiationStyle } from '../../types';

const COMMON_CROPS = [
  'Rice', 'Wheat', 'Cotton', 'Soybean', 'Sugarcane', 'Turmeric', 'Onion',
  'Tomato', 'Potato', 'Chana Dal', 'Mustard', 'Coffee', 'Tea', 'Pepper',
  'Groundnut', 'Coconut', 'Banana', 'Corn', 'Barley', 'Ragi',
];

export function AgentConfigPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Form state
  const [style, setStyle] = useState<NegotiationStyle>('BALANCED');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [autoAcceptThreshold, setAutoAcceptThreshold] = useState('');
  const [autoNegotiate, setAutoNegotiate] = useState(true);
  const [preferredCrops, setPreferredCrops] = useState<string[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const { data } = await api.get('/agent/config');
      setConfig(data);
      setStyle(data.negotiationStyle);
      setMinPrice(data.minPrice?.toString() || '');
      setMaxPrice(data.maxPrice?.toString() || '');
      setAutoAcceptThreshold(data.autoAcceptThreshold?.toString() || '');
      setAutoNegotiate(data.autoNegotiate);
      setPreferredCrops(data.preferredCrops || []);
      setMaxDistanceKm(data.maxDistanceKm?.toString() || '');
    } catch {
      toast.error('Failed to load agent config');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/agent/config', {
        negotiationStyle: style,
        minPrice: minPrice ? Number(minPrice) : null,
        maxPrice: maxPrice ? Number(maxPrice) : null,
        autoAcceptThreshold: autoAcceptThreshold ? Number(autoAcceptThreshold) : null,
        autoNegotiate,
        preferredCrops,
        maxDistanceKm: maxDistanceKm ? Number(maxDistanceKm) : null,
      });
      setConfig(data);
      toast.success('Agent settings saved!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      const { data } = await api.post('/agent/toggle');
      setConfig(data);
      toast.success(data.active ? 'Agent activated!' : 'Agent deactivated');
    } catch {
      toast.error('Failed to toggle agent');
    } finally {
      setToggling(false);
    }
  }

  function toggleCrop(crop: string) {
    setPreferredCrops(prev =>
      prev.includes(crop) ? prev.filter(c => c !== crop) : [...prev, crop]
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl animate-pulse space-y-4">
          <div className="h-8 bg-surface rounded w-48" />
          <div className="h-96 bg-surface rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  const isFarmer = user?.role === 'FARMER';

  return (
    <DashboardLayout>
      <div className="max-w-2xl">
        {/* Header with toggle */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text">AI Agent Settings</h1>
            <p className="text-text-secondary text-sm mt-1">
              Configure how your AI agent negotiates on your behalf
            </p>
          </div>
          <AgentStatusBadge
            active={config?.active || false}
            onToggle={handleToggle}
            loading={toggling}
          />
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Negotiation Style */}
          <Card>
            <NegotiationStylePicker value={style} onChange={setStyle} />
          </Card>

          {/* Price Boundaries */}
          <Card>
            <h3 className="font-semibold text-text mb-1">Price Boundaries</h3>
            <p className="text-xs text-text-muted mb-4">
              The agent will NEVER cross these boundaries during negotiations.
              {isFarmer
                ? ' Set the minimum price you\'re willing to accept.'
                : ' Set the maximum price you\'re willing to pay.'}
            </p>

            <div className="grid grid-cols-2 gap-4">
              {isFarmer ? (
                <>
                  <Input
                    label="Minimum Sell Price (per unit)"
                    type="number"
                    placeholder="e.g., 2000"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                  />
                  <Input
                    label="Auto-Accept Above (optional)"
                    type="number"
                    placeholder="e.g., 3000"
                    value={autoAcceptThreshold}
                    onChange={(e) => setAutoAcceptThreshold(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Maximum Buy Price (per unit)"
                    type="number"
                    placeholder="e.g., 5000"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                  <Input
                    label="Auto-Accept Below (optional)"
                    type="number"
                    placeholder="e.g., 1500"
                    value={autoAcceptThreshold}
                    onChange={(e) => setAutoAcceptThreshold(e.target.value)}
                  />
                </>
              )}
            </div>

            {autoAcceptThreshold && (
              <p className="text-xs text-accent mt-2">
                Bids {isFarmer ? 'above' : 'below'} {autoAcceptThreshold} will be instantly accepted.
              </p>
            )}
          </Card>

          {/* Auto-Negotiate Toggle */}
          <Card>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="font-semibold text-text">Auto-Negotiate</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  When enabled, the agent will automatically respond to bids and counter-offers
                  without waiting for your approval.
                </p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={autoNegotiate}
                  onChange={(e) => setAutoNegotiate(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${autoNegotiate ? 'bg-accent' : 'bg-border'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${autoNegotiate ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </label>
          </Card>

          {/* Buyer-specific: Crop Preferences */}
          {!isFarmer && (
            <Card>
              <h3 className="font-semibold text-text mb-1">Preferred Crops</h3>
              <p className="text-xs text-text-muted mb-3">
                The agent will prioritize listings for these crops.
              </p>
              <div className="flex flex-wrap gap-2">
                {COMMON_CROPS.map(crop => (
                  <button
                    key={crop}
                    type="button"
                    onClick={() => toggleCrop(crop)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors
                      ${preferredCrops.includes(crop)
                        ? 'bg-accent text-white'
                        : 'bg-surface-alt text-text-secondary hover:bg-surface-hover'
                      }`}
                  >
                    {crop}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Buyer-specific: Max Distance */}
          {!isFarmer && (
            <Card>
              <Input
                label="Max Distance (km, optional)"
                type="number"
                placeholder="e.g., 500"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
              />
              <p className="text-xs text-text-muted mt-1">
                Only consider listings within this distance for logistics efficiency.
              </p>
            </Card>
          )}

          {/* Save */}
          <Button type="submit" size="lg" className="w-full" loading={saving}>
            Save Agent Settings
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
