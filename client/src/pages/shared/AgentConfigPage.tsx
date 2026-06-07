// =============================================================================
// AgentConfigPage — Configure the AI negotiation agent
// =============================================================================
// Shared by farmers and buyers (copy adapts via user.role). Lets the user set
// their negotiation style, price floor/ceiling, auto-accept threshold, whether
// to auto-negotiate, preferred crops, and max distance — the guardrails the
// agent stays within. Loads the saved config from /agent on mount and saves
// changes back. Also toggles the agent on/off.
// =============================================================================

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ArrowIcon } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { AgentConfig, NegotiationStyle } from '../../types';

const COMMON_CROPS = [
  'Rice', 'Wheat', 'Cotton', 'Soybean', 'Sugarcane', 'Turmeric', 'Onion',
  'Tomato', 'Potato', 'Chana Dal', 'Mustard', 'Coffee', 'Tea', 'Pepper',
  'Groundnut', 'Coconut', 'Banana', 'Corn', 'Barley', 'Ragi',
];

const STYLE_META: { value: NegotiationStyle; label: string; arrow: string; desc: string; winRate: string }[] = [
  { value: 'AGGRESSIVE', label: 'Aggressive', arrow: '↑', desc: 'open low, chase up to ceiling', winRate: 'wins 78%' },
  { value: 'BALANCED', label: 'Balanced', arrow: '↔', desc: 'meet 60% of delta', winRate: 'wins 84%' },
  { value: 'CONSERVATIVE', label: 'Cautious', arrow: '↓', desc: 'open mid, small increments', winRate: 'wins 67%' },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cb-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="cb-eyebrow">{title}</div>
        {hint && <div className="cb-tiny" style={{ marginTop: 4 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function AgentConfigPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [style, setStyle] = useState<NegotiationStyle>('BALANCED');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [autoAcceptThreshold, setAutoAcceptThreshold] = useState('');
  const [autoNegotiate, setAutoNegotiate] = useState(true);
  const [preferredCrops, setPreferredCrops] = useState<string[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = useState('');

  const isFarmer = user?.role === 'FARMER';
  const currency = user?.currency || 'INR';

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
      toast.success('Agent restarted with new config');
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
      toast.success(data.active ? 'Agent activated' : 'Agent paused');
    } catch {
      toast.error('Failed to toggle agent');
    } finally {
      setToggling(false);
    }
  }

  function toggleCrop(crop: string) {
    setPreferredCrops((prev) => prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]);
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Loading agent config…</div>
      </DashboardLayout>
    );
  }

  const floorVal = parseFloat(minPrice) || 0;
  const ceilVal = parseFloat(maxPrice) || 0;
  const acceptVal = parseFloat(autoAcceptThreshold) || 0;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">Agent · {isFarmer ? 'farmer' : 'buyer'}</div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Calibrate your<br />
        <span className="cb-italic">{isFarmer ? 'farmer agent.' : 'buyer agent.'}</span>
      </h1>

      <div className="cb-card cb-card-forest" style={{ marginTop: 28, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="cb-live-dot" />
            <span className="cb-mono" style={{ color: '#e6efd9', fontWeight: 500 }}>
              {config?.active ? 'ACTIVE' : 'PAUSED'} · style {style}
            </span>
          </div>
          <Button
            variant="ghost"
            onClick={handleToggle}
            loading={toggling}
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e6efd9', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            {config?.active ? '⏸ Pause agent' : '▶ Resume agent'}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Section title="Style · drives negotiation cadence">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {STYLE_META.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                style={{
                  padding: 14, borderRadius: 10, textAlign: 'left',
                  background: style === s.value ? 'rgba(31,45,24,0.05)' : 'transparent',
                  border: `1px solid ${style === s.value ? 'var(--cb-forest)' : 'var(--cb-line)'}`,
                  cursor: 'pointer', color: 'inherit', font: 'inherit',
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{s.label} <span style={{ color: 'var(--cb-ember)' }}>{s.arrow}</span></div>
                <div className="cb-tiny" style={{ marginBottom: 6 }}>{s.desc}</div>
                <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)' }}>{s.winRate}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Guardrails · hard stops" hint="Agent will never cross these.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {isFarmer ? (
              <>
                <Input
                  label="Min sell price (per unit)"
                  type="number"
                  placeholder="e.g., 2000"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
                <Input
                  label="Auto-accept above (optional)"
                  type="number"
                  placeholder="e.g., 3000"
                  value={autoAcceptThreshold}
                  onChange={(e) => setAutoAcceptThreshold(e.target.value)}
                />
              </>
            ) : (
              <>
                <Input
                  label="Max buy price (per unit)"
                  type="number"
                  placeholder="e.g., 5000"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
                <Input
                  label="Auto-accept below (optional)"
                  type="number"
                  placeholder="e.g., 1500"
                  value={autoAcceptThreshold}
                  onChange={(e) => setAutoAcceptThreshold(e.target.value)}
                />
              </>
            )}
          </div>
          {(floorVal > 0 || ceilVal > 0) && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }} className="cb-mono cb-tiny">
                <span>Floor {formatCurrency(floorVal, currency)}</span>
                <span>Ceil {formatCurrency(ceilVal, currency)}</span>
              </div>
              <div className="cb-range-track">
                <div className="cb-range-fill" style={{ left: 0, right: 0 }} />
                <div className="cb-range-marker" style={{ left: '0%' }} />
                <div className="cb-range-marker" style={{ left: '100%' }} />
                {acceptVal > 0 && ceilVal > 0 && floorVal > 0 && (
                  <div className="cb-range-marker" style={{ left: `${Math.min(100, Math.max(0, ((acceptVal - floorVal) / (ceilVal - floorVal)) * 100))}%`, background: 'var(--cb-sage)' }} />
                )}
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 8 }}>
            <input type="checkbox" checked={autoNegotiate} onChange={(e) => setAutoNegotiate(e.target.checked)} style={{ accentColor: 'var(--cb-forest)' }} />
            Auto-negotiate (else hand to me each round)
          </label>
        </Section>

        {!isFarmer && (
          <>
            <Section title={`Preferred crops · ${preferredCrops.length} selected`} hint="Agent acts only on these.">
              <div className="cb-pill-group">
                {COMMON_CROPS.map((crop) => (
                  <button
                    key={crop}
                    type="button"
                    onClick={() => toggleCrop(crop)}
                    className={`cb-pill ${preferredCrops.includes(crop) ? 'active' : ''}`}
                  >
                    {preferredCrops.includes(crop) && '✓ '}{crop}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Max distance · origin radius">
              <Input
                label="Distance (km)"
                type="number"
                placeholder="e.g., 500"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
                hint="Only consider listings within this distance."
              />
            </Section>
          </>
        )}

        <Section title="Strategy preview · what agent will do">
          <div className="cb-card" style={{ background: 'var(--cb-forest)', color: '#e6efd9', fontFamily: 'var(--cb-font-mono)', fontSize: 12.5, lineHeight: 1.7 }}>
            {!isFarmer && preferredCrops.length > 0 && <>IF crop ∈ [{preferredCrops.slice(0, 3).join(', ')}{preferredCrops.length > 3 ? ', …' : ''}]<br /></>}
            {!isFarmer && maxDistanceKm && <>  AND origin within {maxDistanceKm} km<br /></>}
            {!isFarmer && ceilVal > 0 && <>  AND ask ≤ {formatCurrency(ceilVal, currency)}<br /></>}
            {isFarmer && floorVal > 0 && <>IF buyer ask ≥ {formatCurrency(floorVal, currency)}<br /></>}
            THEN open at {style.toLowerCase()} pace<br />
            {acceptVal > 0 && <>  IF counter {isFarmer ? '≥' : '≤'} {formatCurrency(acceptVal, currency)} → auto-accept<br /></>}
            {(isFarmer ? floorVal : ceilVal) > 0 && <>  IF counter {isFarmer ? '<' : '>'} {formatCurrency(isFarmer ? floorVal : ceilVal, currency)} → walk away<br /></>}
              ELSE counter at floor + 60% of delta<br />
            Match competing bids within 0.5%
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="submit" size="lg" loading={saving}>
            Save & restart agent
            <ArrowIcon />
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
