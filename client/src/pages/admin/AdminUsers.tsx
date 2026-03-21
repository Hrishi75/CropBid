// =============================================================================
// Admin Users — User management with search, filter, and trust score editing
// =============================================================================

import { useState, useEffect } from 'react';
import { Users, Search, Edit2, Check, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
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
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, trustScore: score } : u))
      );
      setEditingId(null);
      toast.success('Trust score updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">User Management</h1>
          <span className="text-sm text-text-muted ml-auto">{total} users</span>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-accent text-sm"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-border rounded-lg bg-surface text-text-primary text-sm"
          >
            <option value="">All Roles</option>
            <option value="FARMER">Farmers</option>
            <option value="BUYER">Buyers</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>

        {/* Users table */}
        <Card>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-text-muted">User</th>
                    <th className="pb-3 font-medium text-text-muted">Role</th>
                    <th className="pb-3 font-medium text-text-muted">Location</th>
                    <th className="pb-3 font-medium text-text-muted">Trust Score</th>
                    <th className="pb-3 font-medium text-text-muted">Joined</th>
                    <th className="pb-3 font-medium text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border-light hover:bg-surface-alt">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-text-primary">{user.name}</p>
                            <p className="text-xs text-text-muted">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'FARMER' ? 'bg-green-50 text-green-700' :
                          user.role === 'BUYER' ? 'bg-blue-50 text-blue-700' :
                          'bg-purple-50 text-purple-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 text-text-muted">
                        {user.location || user.country}
                      </td>
                      <td className="py-3">
                        {editingId === user.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editScore}
                              onChange={(e) => setEditScore(e.target.value)}
                              className="w-16 px-2 py-1 border border-border rounded text-sm"
                              min="0"
                              max="100"
                            />
                            <button onClick={() => handleUpdateTrustScore(user.id)} className="text-status-success hover:bg-green-50 p-1 rounded">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-status-error hover:bg-red-50 p-1 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-border rounded-full h-2">
                              <div
                                className="bg-accent rounded-full h-2"
                                style={{ width: `${user.trustScore}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{Math.round(user.trustScore)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-text-muted text-xs">
                        {new Date(user.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => {
                            setEditingId(user.id);
                            setEditScore(String(Math.round(user.trustScore)));
                          }}
                          className="p-1.5 hover:bg-surface-hover rounded transition-colors"
                          title="Edit trust score"
                        >
                          <Edit2 className="w-4 h-4 text-text-muted" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-text-muted">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
