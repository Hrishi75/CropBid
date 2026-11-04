// =============================================================================
// AdminUsers — User directory + trust-score editing
// =============================================================================
// Admin table of all users (via /admin/users) with search, role filter, and
// pagination. Admins can edit a user's trust score inline, suspend an account,
// delete one that never traded or topped up its wallet, and reset the password
// of somebody who has called in locked out. COUNTRY_FLAGS maps country names
// to flag emoji for display.
//
// The temporary password is shown once, on the row, for the admin to read down
// the phone. It is not stored anywhere on this side and cannot be asked for
// again: the server keeps only its hash, so a second look means a second reset.
// It is good for one sign-in, which is the change of password itself.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from './ConfirmButton';
import api from '../../lib/axios';
import { LoadFailed } from './LoadFailed';
import toast from 'react-hot-toast';

interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  phone: string | null;
  location: string | null;
  country: string;
  trustScore: number;
  suspended: boolean;
  avatar: string | null;
  createdAt: string;
  // Why this account cannot be deleted, or null when it can. Worked out by
  // the server with the same rule the delete applies, so the button is only
  // offered when the delete will go through.
  deleteBlocker: 'ADMIN' | 'TRANSACTIONS' | 'WALLET' | 'CONTRACTS' | null;
}

// What an admin reads in place of the button. Admins get nothing, the same as
// Suspend: there is no action on another admin here at all.
const DELETE_BLOCKED: Record<'TRANSACTIONS' | 'WALLET' | 'CONTRACTS', string> = {
  TRANSACTIONS: "Has deals, so can't be deleted",
  WALLET: "Has wallet history, so can't be deleted",
  CONTRACTS: "Has a live supply contract, so can't be deleted",
};

// Counted by the server over every account, whatever the search or filter.
// The tiles used to count the twenty rows on screen, next to a growth figure
// and a "new this week" that were typed in.
interface UserSummary {
  byRole: { CONSUMER: number; FARMER: number; BUYER: number; ADMIN: number };
  newLast7Days: number;
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
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // The one temporary password on screen, if any. Cleared when the admin
  // dismisses it, and never re-fetchable.
  const [issued, setIssued] = useState<{ id: string; name: string; password: string } | null>(null);
  // The row whose details panel is open, if any.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, page]);

  async function fetchUsers() {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/users?${params}`);
      setUsers(res.data.users);
      setTotal(res.data.total);
      setSummary(res.data.summary ?? null);
    } catch (err) {
      console.error('Failed to load users:', err);
      setFailed(true);
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

  // Asked through ConfirmButton, not window.confirm, which embedded browsers
  // can suppress: it returns false without showing anything, and the button
  // looked broken.
  async function handleToggleSuspend(user: AdminUser) {
    const next = !user.suspended;
    const verb = next ? 'Suspend' : 'Reinstate';
    try {
      await api.patch(`/admin/users/${user.id}`, { suspended: next });
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, suspended: next } : u));
      toast.success(next ? 'User suspended' : 'User reinstated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${verb.toLowerCase()}`);
    }
  }

  // Permanent, and it takes their profile, listings and bids with it. The
  // server refuses anyone who has traded or topped up, so what goes is only
  // what never touched money.
  async function handleDelete(user: AdminUser) {
    try {
      await api.delete(`/admin/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setTotal((t) => t - 1);
      toast.success(`${user.name} deleted`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  }

  // For somebody locked out who has reached support. The password comes back
  // once; the user is signed out everywhere and must choose their own at the
  // next sign-in.
  async function handleResetPassword(user: AdminUser) {
    try {
      const { data } = await api.post<{ id: string; name: string; tempPassword: string }>(
        `/admin/users/${user.id}/reset-password`,
      );
      setIssued({ id: data.id, name: data.name, password: data.tempPassword });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not reset the password');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const r = summary?.byRole;
  const everyone = r ? r.CONSUMER + r.FARMER + r.BUYER + r.ADMIN : 0;
  const shareOf = (n: number) => (everyone > 0 ? `${Math.round((n / everyone) * 100)}%` : '0%');

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

      {r && summary && (
      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Accounts</div>
          <div className="cb-kpi-value">{everyone.toLocaleString()}</div>
          <div className="cb-kpi-delta">all roles</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Shoppers</div>
          <div className="cb-kpi-value">{r.CONSUMER.toLocaleString()}</div>
          <div className="cb-kpi-delta">{shareOf(r.CONSUMER)}</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Sellers</div>
          <div className="cb-kpi-value">{r.FARMER.toLocaleString()}</div>
          <div className="cb-kpi-delta">{shareOf(r.FARMER)} · farms, shops, wholesalers</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Buyers</div>
          <div className="cb-kpi-value">{r.BUYER.toLocaleString()}</div>
          <div className="cb-kpi-delta">{shareOf(r.BUYER)}</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Admins</div>
          <div className="cb-kpi-value">{r.ADMIN}</div>
          <div className="cb-kpi-delta">{shareOf(r.ADMIN)}</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">New 7d</div>
          <div className="cb-kpi-value">{summary.newLast7Days.toLocaleString()}</div>
          <div className="cb-kpi-delta">signed up this week</div>
        </div>
      </div>
      )}

      <div className="cb-split-filters" style={{ gap: 24, alignItems: 'start' }}>
        <div className="cb-card" style={{ position: 'sticky', top: 76, alignSelf: 'flex-start', padding: 18 }}>
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Search</div>
            <Input
              placeholder="Name, email or phone"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <div>
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Role</div>
            <div className="cb-pill-group">
              {[
                ['', 'All'],
                ['CONSUMER', 'Shopper'],
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
          ) : failed ? (
            <LoadFailed what="users" onRetry={fetchUsers} />
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
                          {u.suspended && (
                            <span className="cb-tiny" style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: 'var(--cb-ember)', color: '#fff', fontWeight: 500 }}>suspended</span>
                          )}
                          {u.email && <span className="cb-tiny" style={{ marginLeft: 8 }}>{u.email}</span>}
                          {u.phone && <span className="cb-mono cb-tiny" style={{ marginLeft: 8 }}>{u.phone}</span>}
                        </div>
                        <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{u.role === 'CONSUMER' ? 'shopper' : u.role.toLowerCase()}</span>
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
                            <button
                              type="button"
                              onClick={() => setViewingId(viewingId === u.id ? null : u.id)}
                              className="cb-btn cb-btn-link"
                              style={{ fontSize: 12 }}
                              aria-expanded={viewingId === u.id}
                            >
                              {viewingId === u.id ? 'Hide' : 'View'}
                            </button>
                            {u.role !== 'ADMIN' && (
                              <ConfirmButton
                                label={u.suspended ? 'Reinstate' : 'Suspend'}
                                confirmLabel={u.suspended
                                  ? `Reinstate ${u.name}? They will be able to sign in again.`
                                  : `Suspend ${u.name}? They are signed out and blocked from signing in.`}
                                color={u.suspended ? 'var(--cb-ink-3)' : 'var(--cb-ember)'}
                                onConfirm={() => handleToggleSuspend(u)}
                              />
                            )}
                            {u.role !== 'ADMIN' && (
                              <ConfirmButton
                                label="Reset password"
                                confirmLabel={`Set a temporary password for ${u.name}? It signs them out everywhere.`}
                                color="var(--cb-ink-3)"
                                onConfirm={() => handleResetPassword(u)}
                              />
                            )}
                            {u.deleteBlocker === null && (
                              <ConfirmButton
                                label="Delete"
                                confirmLabel={`Delete ${u.name} for good? Their profile, listings and bids go too.`}
                                onConfirm={() => handleDelete(u)}
                              />
                            )}
                            {(u.deleteBlocker === 'TRANSACTIONS' || u.deleteBlocker === 'WALLET' || u.deleteBlocker === 'CONTRACTS') && (
                              <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{DELETE_BLOCKED[u.deleteBlocker]}</span>
                            )}
                          </>
                        )}
                      </div>

                      {viewingId === u.id && <UserDetailPanel key={u.id} userId={u.id} />}

                      {issued?.id === u.id && (
                        <TempPasswordPanel
                          name={issued.name}
                          password={issued.password}
                          onDone={() => setIssued(null)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
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

// Shown once, on the row it belongs to. Read it to the person on the phone:
// the server kept only a hash of it, so closing this is the end of it and
// another look means another reset.
function TempPasswordPanel({ name, password, onDone }: {
  name: string;
  password: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of contexts, and the password is
      // on screen to be read aloud anyway.
      toast.error('Could not copy it. Read it from the screen.');
    }
  }

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 8, background: 'var(--cb-paper-2)' }}>
      <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Temporary password for {name}</div>
      <div className="cb-mono" style={{ fontSize: 20, letterSpacing: 1, marginBottom: 10 }}>{password}</div>
      <p className="cb-tiny" style={{ color: 'var(--cb-ink-2)', marginBottom: 10 }}>
        Read it to them now. It is shown once and we keep no copy, so asking again means resetting
        again. They are signed out everywhere, and this password does one thing: sign in and choose
        their own. Until they do, nothing else on their account opens.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

interface UserDetail {
  id: string;
  language: string;
  updatedAt: string;
  consentAt: string | null;
  consentVersion: string | null;
  mustChangePassword: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  seller: {
    sellerType: string;
    businessName: string | null;
    shopType: string | null;
    state: string;
    status: string;
    statusNote: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    organicCertified: boolean;
    cropsGrown: string[];
    listings: number;
    hasPayoutDetails: boolean;
  } | null;
  buyerProfile: {
    companyName: string;
    companyType: string;
    status: string;
    statusNote: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  } | null;
  walletBalance: number | null;
  counts: {
    bids: number;
    dealsAsSeller: number;
    dealsAsBuyer: number;
    shopOrdersPlaced: number;
    shopOrdersTaken: number;
    requests: number;
    offers: number;
    addresses: number;
  };
}

const words = (v: string) => v.toLowerCase().replace(/_/g, ' ');
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

// Opened by View. Fetched on open rather than with the list, so a page of
// fifteen rows does not pay for fifteen sets of counts nobody looks at. PAN,
// licence numbers and payout details are not here: they are read in
// Admin -> Partners, where payout reads are logged.
function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.get<UserDetail>(`/admin/users/${userId}`)
      .then((res) => { if (live) setDetail(res.data); })
      .catch((err: any) => { if (live) setError(err.response?.data?.message || 'Could not load this user'); });
    return () => { live = false; };
  }, [userId]);

  const box = { marginTop: 12, padding: 14, borderRadius: 8, background: 'var(--cb-paper-2)' } as const;

  if (error) return <div style={box}><span className="cb-tiny" style={{ color: 'var(--cb-ember)' }}>{error}</span></div>;
  if (!detail) return <div style={box}><span className="cb-tiny">Loading details…</span></div>;

  const signIn = [
    detail.hasPassword && 'password',
    detail.googleLinked && 'Google',
    !detail.hasPassword && !detail.googleLinked && 'phone code only',
  ].filter(Boolean).join(', ');

  const c = detail.counts;
  const activity: [string, number][] = [
    ['Deals as seller', c.dealsAsSeller],
    ['Deals as buyer', c.dealsAsBuyer],
    ['Bids', c.bids],
    ['Shop orders placed', c.shopOrdersPlaced],
    ['Shop orders taken', c.shopOrdersTaken],
    ['Requests posted', c.requests],
    ['Offers sent', c.offers],
    ['Saved addresses', c.addresses],
  ];

  return (
    <div style={box}>
      <Section title="Account">
        <Row label="Signs in with" value={signIn} />
        {detail.mustChangePassword && <Row label="Password" value="temporary, must change at next sign-in" />}
        <Row label="Language" value={detail.language} />
        <Row label="Consent" value={detail.consentAt ? `${day(detail.consentAt)} (policy ${detail.consentVersion ?? '?'})` : 'none recorded'} />
        <Row label="Wallet" value={detail.walletBalance === null ? 'never opened' : `${detail.walletBalance.toLocaleString('en-IN')} credits`} />
        <Row label="Last updated" value={day(detail.updatedAt)} />
      </Section>

      {detail.seller && (
        <Section title="Seller application">
          <Row label="Kind" value={words(detail.seller.sellerType)} />
          {detail.seller.businessName && <Row label="Business" value={detail.seller.businessName} />}
          {detail.seller.shopType && <Row label="Shop type" value={detail.seller.shopType} />}
          <Row label="State" value={detail.seller.state} />
          <Row label="Status" value={`${words(detail.seller.status)} · filed ${day(detail.seller.submittedAt)}${detail.seller.reviewedAt ? ` · reviewed ${day(detail.seller.reviewedAt)}` : ''}`} />
          {detail.seller.statusNote && <Row label="Note to them" value={detail.seller.statusNote} />}
          {detail.seller.cropsGrown.length > 0 && <Row label="Crops" value={detail.seller.cropsGrown.join(', ')} />}
          <Row label="Organic" value={detail.seller.organicCertified ? 'yes' : 'no'} />
          <Row label="Listings" value={String(detail.seller.listings)} />
          <Row label="Payout details" value={detail.seller.hasPayoutDetails ? 'on file' : 'missing'} />
        </Section>
      )}

      {detail.buyerProfile && (
        <Section title="Buyer application">
          <Row label="Company" value={detail.buyerProfile.companyName} />
          <Row label="Type" value={words(detail.buyerProfile.companyType)} />
          <Row label="Status" value={`${words(detail.buyerProfile.status)} · filed ${day(detail.buyerProfile.submittedAt)}${detail.buyerProfile.reviewedAt ? ` · reviewed ${day(detail.buyerProfile.reviewedAt)}` : ''}`} />
          {detail.buyerProfile.statusNote && <Row label="Note to them" value={detail.buyerProfile.statusNote} />}
        </Section>
      )}

      {(detail.seller || detail.buyerProfile) && (
        <p className="cb-tiny" style={{ color: 'var(--cb-ink-3)', margin: '0 0 12px' }}>
          PAN, licence numbers and payout details are in <Link to="/admin/partners">Partners</Link>.
        </p>
      )}

      <Section title="Activity" last>
        {activity.map(([label, n]) => <Row key={label} label={label} value={String(n)} />)}
      </Section>
    </div>
  );
}

function Section({ title, last, children }: { title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="cb-tiny" style={{ display: 'flex', gap: 12, padding: '2px 0', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--cb-ink-3)', minWidth: 140 }}>{label}</span>
      <span style={{ color: 'var(--cb-ink)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}
