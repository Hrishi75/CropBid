// =============================================================================
// Admin Logistics — Manage logistics partners
// =============================================================================

import { useState, useEffect } from 'react';
import {
  Truck, Plus, Star, ToggleLeft, ToggleRight,
  Edit2, X, Check,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
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
    } catch (err: any) {
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
      coverageRegions: form.coverageRegions.split(',').map(s => s.trim()).filter(Boolean),
      coverageCountries: form.coverageCountries.split(',').map(s => s.trim()).filter(Boolean),
      vehicleTypes: form.vehicleTypes.split(',').map(s => s.trim()).filter(Boolean),
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
    } catch (err: any) {
      toast.error('Failed to toggle partner');
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Truck className="w-7 h-7 text-primary" />
            <h1 className="text-xl font-bold text-text-primary">Logistics Partners</h1>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Add Partner
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm bg-surface"
          >
            <option value="">All Types</option>
            {LOGISTICS_TYPES.map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm bg-surface"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        {/* Partner form modal */}
        {showForm && (
          <Card className="mb-6 border-primary/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-primary">
                {editingId ? 'Edit Partner' : 'New Partner'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Partner name" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LogisticsType })} className="px-3 py-2 border border-border rounded-lg text-sm bg-surface">
                {LOGISTICS_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
              <input type="text" value={form.coverageRegions} onChange={e => setForm({ ...form, coverageRegions: e.target.value })} placeholder="Regions (comma sep)" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="text" value={form.coverageCountries} onChange={e => setForm({ ...form, coverageCountries: e.target.value })} placeholder="Countries (comma sep)" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="text" value={form.vehicleTypes} onChange={e => setForm({ ...form, vehicleTypes: e.target.value })} placeholder="Vehicle types (comma sep)" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="number" value={form.minQuantityKg} onChange={e => setForm({ ...form, minQuantityKg: e.target.value })} placeholder="Min qty (kg)" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="number" value={form.maxQuantityKg} onChange={e => setForm({ ...form, maxQuantityKg: e.target.value })} placeholder="Max qty (kg)" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="number" step="0.0001" value={form.costPerKmPerKg} onChange={e => setForm({ ...form, costPerKmPerKg: e.target.value })} placeholder="Cost/km/kg" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="number" value={form.avgDeliveryDays} onChange={e => setForm({ ...form, avgDeliveryDays: e.target.value })} placeholder="Avg delivery days" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} placeholder="Contact email" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="text" value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} placeholder="Contact phone" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
              <input type="number" step="0.1" value={form.commissionPercent} onChange={e => setForm({ ...form, commissionPercent: e.target.value })} placeholder="Commission %" className="px-3 py-2 border border-border rounded-lg text-sm bg-surface" />
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave} loading={saving}>
                <Check className="w-4 h-4 mr-1" />
                {editingId ? 'Update' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </Card>
        )}

        {/* Partners list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : partners.length === 0 ? (
          <Card>
            <p className="text-center text-text-muted py-8">No logistics partners found.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {partners.map(partner => (
              <Card key={partner.id} padding="sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-text-primary">{partner.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-alt text-text-muted">
                        {partner.type.replace('_', ' ')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        partner.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {partner.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {partner.rating}
                      </span>
                      <span>{partner.minQuantityKg}–{partner.maxQuantityKg} kg</span>
                      <span>~{partner.avgDeliveryDays} days</span>
                      <span>{partner.commissionPercent}% commission</span>
                      <span>₹{partner.costPerKmPerKg}/km/kg</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {partner.coverageRegions.slice(0, 5).map(r => (
                        <span key={r} className="text-xs bg-surface-alt px-2 py-0.5 rounded">{r}</span>
                      ))}
                      {partner.coverageRegions.length > 5 && (
                        <span className="text-xs text-text-muted">+{partner.coverageRegions.length - 5} more</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => openEdit(partner)}
                      className="p-1.5 rounded-lg hover:bg-surface-alt text-text-muted hover:text-text-primary"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(partner.id)}
                      className="p-1.5 rounded-lg hover:bg-surface-alt"
                      title={partner.active ? 'Deactivate' : 'Activate'}
                    >
                      {partner.active
                        ? <ToggleRight className="w-5 h-5 text-green-600" />
                        : <ToggleLeft className="w-5 h-5 text-text-muted" />
                      }
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
