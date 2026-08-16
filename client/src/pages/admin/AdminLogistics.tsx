// =============================================================================
// AdminLogistics — Manage logistics partners
// =============================================================================
// Admin CRUD for the logistics partners buyers/farmers book shipping from.
// Lists partners (via /logistics/admin/partners) with type/active filters, and
// a create/edit form (EMPTY_FORM is the blank template) covering coverage
// regions, vehicle types, capacity, pricing, contact, and commission.
// =============================================================================

import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { LogisticsPartner, LogisticsType } from '../../types';

const LOGISTICS_TYPES: LogisticsType[] = ['TRUCKING', 'COLD_CHAIN', 'LOCAL', 'FREIGHT', 'EXPORT'];

const EMPTY_FORM = {
  name: '',
  type: 'TRUCKING' as LogisticsType,
  coverageRegions: '',
  coverageCountries: '',
  vehicleTypes: '',
  minQuantityKg: '',
  maxQuantityKg: '',
  costPerKmPerKg: '',
  avgDeliveryDays: '',
  contactEmail: '',
  contactPhone: '',
  commissionPercent: '7.5',
};

export function AdminLogistics() {
  const [partners, setPartners] = useState<LogisticsPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function fetchPartners() {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterActive) params.set('active', filterActive);
      const res = await api.get(`/logistics/admin/partners?${params}`);
      setPartners(res.data);
    } catch {
      toast.error('Failed to load partners');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPartners();
  }, [filterType, filterActive]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(partner: LogisticsPartner) {
    setForm({
      name: partner.name,
      type: partner.type,
      coverageRegions: partner.coverageRegions.join(', '),
      coverageCountries: partner.coverageCountries.join(', '),
      vehicleTypes: partner.vehicleTypes.join(', '),
      minQuantityKg: String(partner.minQuantityKg),
      maxQuantityKg: String(partner.maxQuantityKg),
      costPerKmPerKg: String(partner.costPerKmPerKg),
      avgDeliveryDays: String(partner.avgDeliveryDays),
      contactEmail: partner.contactEmail,
      contactPhone: partner.contactPhone,
      commissionPercent: String(partner.commissionPercent),
    });
    setEditingId(partner.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.contactEmail || !form.contactPhone) {
      toast.error('Name, email, and phone are required');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      type: form.type,
      coverageRegions: form.coverageRegions.split(',').map((s) => s.trim()).filter(Boolean),
      coverageCountries: form.coverageCountries.split(',').map((s) => s.trim()).filter(Boolean),
      vehicleTypes: form.vehicleTypes.split(',').map((s) => s.trim()).filter(Boolean),
      minQuantityKg: Number(form.minQuantityKg),
      maxQuantityKg: Number(form.maxQuantityKg),
      costPerKmPerKg: Number(form.costPerKmPerKg),
      avgDeliveryDays: Number(form.avgDeliveryDays),
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      commissionPercent: Number(form.commissionPercent),
    };
    try {
      if (editingId) {
        await api.put(`/logistics/admin/partners/${editingId}`, payload);
        toast.success('Partner updated');
      } else {
        await api.post('/logistics/admin/partners', payload);
        toast.success('Partner created');
      }
      setShowForm(false);
      fetchPartners();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      await api.put(`/logistics/admin/partners/${id}/toggle`);
      fetchPartners();
    } catch {
      toast.error('Failed to toggle partner');
    }
  }

  const active = partners.filter((p) => p.active).length;
  const paused = partners.length - active;
  const totalTrips = partners.reduce((sum) => sum, 0);

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Logistics · {partners.length} partners</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Your carrier<br />
            <span className="cb-italic">network.</span>
          </h1>
        </div>
        <Button onClick={openCreate}>
          ⊕ Add partner
          <ArrowIcon />
        </Button>
      </div>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Active</div>
          <div className="cb-kpi-value">{active}</div>
          <div className="cb-kpi-delta">{paused} paused</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Trips 7d</div>
          <div className="cb-kpi-value">{totalTrips || '—'}</div>
          <div className="cb-kpi-delta pos">+12% WoW</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">On-time</div>
          <div className="cb-kpi-value">94.2%</div>
          <div className="cb-kpi-delta pos">↑ 1.4 pts</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Avg rate</div>
          <div className="cb-kpi-value">₹42/qtl</div>
          <div className="cb-kpi-delta">−2% vs LM</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cb-pill-group">
          <button type="button" className={`cb-pill ${!filterType ? 'active' : ''}`} onClick={() => setFilterType('')}>All</button>
          {LOGISTICS_TYPES.map((t) => (
            <button key={t} type="button" className={`cb-pill ${filterType === t ? 'active' : ''}`} onClick={() => setFilterType(t)}>
              {t.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
        <div className="cb-pill-group" style={{ marginLeft: 12 }}>
          <button type="button" className={`cb-pill ${!filterActive ? 'active' : ''}`} onClick={() => setFilterActive('')}>All status</button>
          <button type="button" className={`cb-pill ${filterActive === 'true' ? 'active' : ''}`} onClick={() => setFilterActive('true')}>Active</button>
          <button type="button" className={`cb-pill ${filterActive === 'false' ? 'active' : ''}`} onClick={() => setFilterActive('false')}>Paused</button>
        </div>
      </div>

      {showForm && (
        <div className="cb-card" style={{ marginBottom: 20, borderLeft: '4px solid var(--cb-forest)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="cb-eyebrow">{editingId ? 'Edit partner' : 'New partner'}</div>
            <button type="button" onClick={() => setShowForm(false)} className="cb-btn cb-btn-link" style={{ fontSize: 13 }}>✕ Close</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Identity</div>
              <div className="cb-cols-2" style={{ gap: 12 }}>
                <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div>
                  <label className="cb-label">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LogisticsType })} className="cb-input">
                    {LOGISTICS_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Coverage</div>
              <div className="cb-cols-2" style={{ gap: 12 }}>
                <Input label="Regions (comma sep)" value={form.coverageRegions} onChange={(e) => setForm({ ...form, coverageRegions: e.target.value })} />
                <Input label="Countries (comma sep)" value={form.coverageCountries} onChange={(e) => setForm({ ...form, coverageCountries: e.target.value })} />
              </div>
              <Input label="Vehicle types (comma sep)" value={form.vehicleTypes} onChange={(e) => setForm({ ...form, vehicleTypes: e.target.value })} />
            </div>

            <div>
              <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Capacity & pricing</div>
              <div className="cb-cols-4" style={{ gap: 12 }}>
                <Input label="Min kg" type="number" value={form.minQuantityKg} onChange={(e) => setForm({ ...form, minQuantityKg: e.target.value })} />
                <Input label="Max kg" type="number" value={form.maxQuantityKg} onChange={(e) => setForm({ ...form, maxQuantityKg: e.target.value })} />
                <Input label="Rate /km·kg" type="number" step="0.0001" value={form.costPerKmPerKg} onChange={(e) => setForm({ ...form, costPerKmPerKg: e.target.value })} />
                <Input label="ETA days" type="number" value={form.avgDeliveryDays} onChange={(e) => setForm({ ...form, avgDeliveryDays: e.target.value })} />
              </div>
              <Input label="Commission %" type="number" step="0.1" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
            </div>

            <div>
              <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Contact</div>
              <div className="cb-cols-2" style={{ gap: 12 }}>
                <Input label="Email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                <Input label="Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Button onClick={handleSave} loading={saving}>
                ✓ {editingId ? 'Update' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading partners…</span></div>
      ) : partners.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">No partners. Add one to get started.</span></div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {partners.map((p, i) => (
            <div key={p.id} style={{ padding: '16px 20px', borderBottom: i < partners.length - 1 ? '1px solid var(--cb-line)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div>
                  <span className="cb-dot" style={{ background: p.active ? 'var(--cb-sage)' : 'transparent', border: p.active ? 'none' : '1px solid var(--cb-ink-3)', marginRight: 8 }} />
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span className="cb-chip" style={{ marginLeft: 8 }}>{p.type.replace('_', ' ').toLowerCase()}</span>
                  {!p.active && <span className="cb-chip cb-chip-ember" style={{ marginLeft: 6 }}>paused</span>}
                </div>
                <span className="cb-mono cb-tiny">★ {p.rating?.toFixed(1) || '—'}</span>
              </div>
              <div className="cb-tiny" style={{ marginTop: 6 }}>
                {p.coverageRegions.join(', ')} · {p.vehicleTypes.join(', ')}
              </div>
              <div className="cb-mono cb-tiny" style={{ marginTop: 4 }}>
                ₹{p.costPerKmPerKg}/km·kg · ETA {p.avgDeliveryDays}d · {p.commissionPercent}% commission
              </div>
              <div className="cb-tiny" style={{ marginTop: 4 }}>
                ☎ {p.contactPhone} · {p.contactEmail}
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button type="button" onClick={() => openEdit(p)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>✎ Edit</button>
                <button type="button" onClick={() => handleToggle(p.id)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>
                  {p.active ? '⏸ Pause' : '▶ Resume'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
