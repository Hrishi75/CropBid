import { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  location: string | null;
  country: string;
  trustScore: number;
  avatar: string | null;
  createdAt: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  'India': '🇮🇳',
  'United States': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'Brazil': '🇧🇷',
  'Kenya': '🇰🇪',
};

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, page]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/users?${params}`);
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateTrustScore(userId: string) {
    const score = parseFloat(editScore);
    if (isNaN(score) || score < 0 || score > 100) {
      toast.error('Trust score must be between 0 and 100');
      return;
    }
    try {
      await api.patch(`/admin/users/${userId}`, { trustScore: score });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, trustScore: score } : u));
      setEditingId(null);
      toast.success('Trust score updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const farmers = users.filter((u) => u.role === 'FARMER').length;
  const buyers = users.filter((u) => u.role === 'BUYER').length;
  const admins = users.filter((u) => u.role === 'ADMIN').length;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Users · {total.toLocaleString()} total</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Members, KYC,<br />
            <span className="cb-italic">trust.</span>
          </h1>
        </div>
        <button type="button" className="cb-btn cb-btn-ghost">Export ↓ CSV</button>
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Total</div>
          <div className="cb-kpi-value">{total.toLocaleString()}</div>
          <div className="cb-kpi-delta pos">+18% Q</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Farmers</div>
          <div className="cb-kpi-value">{farmers}</div>
          <div className="cb-kpi-delta">{users.length > 0 ? Math.round((farmers / users.length) * 100) : 0}%</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Buyers</div>
          <div className="cb-kpi-value">{buyers}</div>
          <div className="cb-kpi-delta">{users.length > 0 ? Math.round((buyers / users.length) * 100) : 0}%</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Admins</div>
          <div className="cb-kpi-value">{admins}</div>
          <div className="cb-kpi-delta">—</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">New 7d</div>
          <div className="cb-kpi-value">+{Math.round(total * 0.08)}</div>
          <div className="cb-kpi-delta">est. from total</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
        <div className="cb-card" style={{ position: 'sticky', top: 76, alignSelf: 'flex-start', padding: 18 }}>
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Search</div>
            <Input
              placeholder="Name or email"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <div>
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Role</div>
            <div className="cb-pill-group">
              {[
                ['', 'All'],
                ['FARMER', 'Farmer'],
                ['BUYER', 'Buyer'],
                ['ADMIN', 'Admin'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={`cb-pill ${roleFilter === v ? 'active' : ''}`}
                  onClick={() => { setRoleFilter(v); setPage(0); }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          {loading ? (
            <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading users…</span></div>
          ) : users.length === 0 ? (
            <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
              <span className="cb-tiny">No users match.</span>
            </div>
          ) : (
            <div className="cb-card" style={{ padding: 0 }}>
              {users.map((u, i) => {
                const flag = COUNTRY_FLAGS[u.country] || '🌐';
                const initials = u.name.split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
                const stars = u.trustScore >= 85 ? '★★★★★' : u.trustScore >= 70 ? '★★★★' : u.trustScore >= 50 ? '★★★' : '★★';
                return (
                  <div key={u.id} style={{ padding: '14px 20px', borderBottom: i < users.length - 1 ? '1px solid var(--cb-line)' : 'none', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--cb-paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 500 }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{u.name}</span>
                          <span className="cb-tiny" style={{ marginLeft: 8 }}>{u.email}</span>
                        </div>
                        <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{u.role.toLowerCase()}</span>
                      </div>
                      <div className="cb-tiny" style={{ marginTop: 4 }}>
                        {flag} {u.country}{u.location ? ` · ${u.location}` : ''} · joined {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                        {editingId === u.id ? (
                          <>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={editScore}
                              onChange={(e) => setEditScore(e.target.value)}
                              className="cb-input"
                              style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
                              autoFocus
                            />
                            <Button size="sm" onClick={() => handleUpdateTrustScore(u.id)}>✓ Save</Button>
                            <button type="button" onClick={() => setEditingId(null)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>✕ Cancel</button>
                          </>
                        ) : (
                          <>
                            <span className="cb-mono cb-tiny">{stars} {Math.round(u.trustScore)}</span>
                            <button
                              type="button"
                              onClick={() => { setEditingId(u.id); setEditScore(String(u.trustScore)); }}
                              className="cb-btn cb-btn-link"
                              style={{ fontSize: 12 }}
                            >
                              ✎ Edit
                            </button>
                            <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>View</button>
                            <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12, color: 'var(--cb-ember)' }}>Suspend</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
              <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>← prev</button>
              <span>page {page + 1} of {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>next →</button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
