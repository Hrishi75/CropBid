// =============================================================================
// AdminPartners — the partner application review queue
// =============================================================================
// Every seller and buyer application lands here and nowhere else. The queue
// lists oldest submissions first (they've waited longest), flags anything
// older than 48h, and lets an admin act without leaving the page:
//   Approve       → account goes live, applicant notified (in-app + email)
//   Request info  → application returns to the applicant with a note
//   Reject        → declined with a reason; applicant may edit and resubmit
//   Suspend       → pulls a live partner off the marketplace (from Approved)
//   Reinstate     → lets a suspended partner back on
// Notes are typed inline — reject/request-info/suspend won't send without
// one, because "rejected" with no reason is support ticket bait.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { COMPANY_TYPE_LABEL } from '../../utils/companyType';
import { SELLER_TYPE_LABEL, SHOP_TYPE_OPTIONS, PARTNER_STATUS_META } from '../../utils/partner';
import type { PartnerStatus, SellerType } from '../../types';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

interface ApplicationRow {
  kind: 'SELLER' | 'BUYER';
  id: string;
  status: PartnerStatus;
  statusNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  user: {
    id: string; name: string; phone: string | null; email: string | null;
    location: string | null; country: string; createdAt: string; trustScore: number;
  };
  // Seller fields
  sellerType?: SellerType;
  farmSizeAcres?: number | null;
  cropsGrown?: string[];
  state?: string;
  businessName?: string | null;
  shopType?: string | null;
  address?: string | null;
  fssaiLicense?: string | null;
  gstin?: string | null;
  minOrderValue?: number | null;
  leadTimeDays?: number | null;
  fpoName?: string | null;
  apmcLicense?: string | null;
  organicCertified?: boolean;
  // Buyer fields
  companyName?: string;
  companyType?: string;
  taxId?: string | null;
  annualProcurementVolume?: string | null;
  outletCount?: number | null;
}

type ReviewAction = 'APPROVE' | 'REQUEST_INFO' | 'REJECT' | 'SUSPEND' | 'REINSTATE';

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'SUBMITTED', label: 'Waiting' },
  { value: 'NEEDS_INFO', label: 'Needs info' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: '', label: 'All' },
];

// Which buttons a row offers, per current status. Mirrors ACTION_RULES on the
// server — the server is the enforcer, this only avoids offering dead ends.
const ACTIONS_FOR_STATUS: Record<string, { action: ReviewAction; label: string; primary?: boolean; needsNote?: boolean }[]> = {
  SUBMITTED: [
    { action: 'APPROVE', label: 'Approve', primary: true },
    { action: 'REQUEST_INFO', label: 'Request info', needsNote: true },
    { action: 'REJECT', label: 'Reject', needsNote: true },
  ],
  UNDER_REVIEW: [
    { action: 'APPROVE', label: 'Approve', primary: true },
    { action: 'REQUEST_INFO', label: 'Request info', needsNote: true },
    { action: 'REJECT', label: 'Reject', needsNote: true },
  ],
  NEEDS_INFO: [
    { action: 'APPROVE', label: 'Approve anyway', primary: true },
    { action: 'REJECT', label: 'Reject', needsNote: true },
  ],
  APPROVED: [
    { action: 'SUSPEND', label: 'Suspend', needsNote: true },
  ],
  REJECTED: [],
  SUSPENDED: [
    { action: 'REINSTATE', label: 'Reinstate', primary: true },
  ],
};

function daysWaiting(submittedAt: string): number {
  return Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000);
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>{label}</div>
      <div className={mono ? 'cb-mono' : ''} style={{ fontSize: 13.5 }}>{value}</div>
    </div>
  );
}

function ApplicationCard({ app, onDone }: { app: ApplicationRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  // Which action is waiting for its note; null = no note box on screen.
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const meta = PARTNER_STATUS_META[app.status];
  const subtype = app.kind === 'SELLER'
    ? SELLER_TYPE_LABEL[app.sellerType || 'FARMER']
    : (COMPANY_TYPE_LABEL[app.companyType || ''] || app.companyType);
  const displayName = app.kind === 'SELLER'
    ? (app.businessName || app.user.name)
    : (app.companyName || app.user.name);
  const waited = daysWaiting(app.submittedAt);
  const stale = waited >= 2 && (app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW');
  const shopTypeLabel = SHOP_TYPE_OPTIONS.find((o) => o.value === app.shopType)?.label || app.shopType;

  async function act(action: ReviewAction, needsNote?: boolean) {
    if (needsNote && pendingAction !== action) {
      // First click reveals the note box; the send happens on confirm.
      setPendingAction(action);
      setNote('');
      return;
    }
    if (needsNote && !note.trim()) {
      toast.error('Write a note to the applicant first');
      return;
    }
    setActing(true);
    try {
      await api.post(`/admin/partners/${app.id}/review`, {
        kind: app.kind,
        action,
        note: note.trim() || undefined,
      });
      toast.success(
        action === 'APPROVE' ? `${displayName} is live`
        : action === 'REQUEST_INFO' ? 'Sent back to the applicant'
        : action === 'REJECT' ? 'Application rejected'
        : action === 'SUSPEND' ? 'Partner suspended'
        : 'Partner reinstated'
      );
      setPendingAction(null);
      setNote('');
      onDone();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActing(false);
    }
  }

  const actions = ACTIONS_FOR_STATUS[app.status] || [];

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--cb-line)' }}>
      {/* Header row — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
        aria-expanded={open}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="cb-chip" style={{ textTransform: 'none' }}>
              {app.kind === 'SELLER' ? 'Seller' : 'Buyer'} · {subtype}
            </span>
            <span style={{ fontWeight: 500 }}>{displayName}</span>
            <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
              {app.user.name}{app.user.location ? ` · ${app.user.location}` : ''}{app.state ? `, ${app.state}` : ''}
            </span>
          </div>
          <span className="cb-mono cb-tiny" style={{ color: meta.color, whiteSpace: 'nowrap' }}>
            ● {meta.label}
          </span>
        </div>
        <div className="cb-mono cb-tiny" style={{ marginTop: 6, color: stale ? 'var(--cb-ember)' : 'var(--cb-ink-3)' }}>
          submitted {new Date(app.submittedAt).toLocaleDateString()}
          {waited > 0 ? ` · waiting ${waited}d` : ' · today'}
          {stale ? ' · overdue' : ''}
          <span style={{ float: 'right' }}>{open ? '▲ collapse' : '▼ review'}</span>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--cb-line)' }}>
          {/* Everything the applicant filed, in one glance */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            <Field label="PHONE" value={app.user.phone} mono />
            <Field label="EMAIL" value={app.user.email} mono />
            <Field label="COUNTRY" value={app.user.country} />
            {app.kind === 'SELLER' ? (
              <>
                <Field label="STATE" value={app.state} />
                <Field label="ADDRESS" value={app.address} />
                {app.sellerType === 'FARMER' && (
                  <>
                    <Field label="FARM SIZE" value={app.farmSizeAcres ? `${app.farmSizeAcres} acres` : null} />
                    <Field label="ORGANIC" value={app.organicCertified ? 'Certified' : null} />
                    <Field label="FPO" value={app.fpoName} />
                  </>
                )}
                {app.sellerType === 'LOCAL_SHOP' && <Field label="SHOP TYPE" value={shopTypeLabel} />}
                <Field label="FSSAI" value={app.fssaiLicense} mono />
                <Field label="GSTIN" value={app.gstin} mono />
                <Field label="APMC" value={app.apmcLicense} mono />
                {app.sellerType === 'WHOLESALER' && (
                  <>
                    <Field label="MIN ORDER" value={app.minOrderValue ? `₹${app.minOrderValue.toLocaleString()}` : null} mono />
                    <Field label="LEAD TIME" value={app.leadTimeDays != null ? `${app.leadTimeDays}d` : null} mono />
                  </>
                )}
              </>
            ) : (
              <>
                <Field label="GST / TAX ID" value={app.taxId} mono />
                <Field label="VOLUME" value={app.annualProcurementVolume} />
                <Field label="OUTLETS" value={app.outletCount} mono />
              </>
            )}
          </div>

          {app.kind === 'SELLER' && (app.cropsGrown?.length || 0) > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {app.cropsGrown!.map((c) => (
                <span key={c} className="cb-chip" style={{ textTransform: 'none', letterSpacing: 0 }}>{c}</span>
              ))}
            </div>
          )}

          {app.statusNote && (
            <div className="cb-small" style={{ marginTop: 12, color: 'var(--cb-ink-2)' }}>
              Last note to applicant: “{app.statusNote}”
            </div>
          )}

          {/* Actions */}
          {actions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {pendingAction && (
                <div style={{ marginBottom: 10 }}>
                  <label className="cb-label">
                    Note to the applicant — they see this word for word
                  </label>
                  <textarea
                    className="cb-input"
                    rows={2}
                    autoFocus
                    placeholder={
                      pendingAction === 'REQUEST_INFO'
                        ? 'e.g., Your FSSAI number has 12 digits — a licence has 14. Please recheck and resubmit.'
                        : pendingAction === 'REJECT'
                          ? 'e.g., We could not verify this GSTIN with the trade name given.'
                          : 'Why is this partner being suspended?'
                    }
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {actions.map((a) => {
                  const isPendingThis = pendingAction === a.action;
                  return (
                    <button
                      key={a.action}
                      type="button"
                      disabled={acting}
                      onClick={() => act(a.action, a.needsNote)}
                      className={`cb-btn cb-btn-sm ${a.primary && !pendingAction ? 'cb-btn-primary' : isPendingThis ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
                    >
                      {isPendingThis ? `Confirm: ${a.label.toLowerCase()}` : a.label}
                    </button>
                  );
                })}
                {pendingAction && (
                  <button
                    type="button"
                    className="cb-btn cb-btn-sm cb-btn-link"
                    onClick={() => { setPendingAction(null); setNote(''); }}
                  >
                    cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminPartners() {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('SUBMITTED');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/partners?${params}`);
      setApps(res.data.applications);
      setTotal(res.data.total);
      setCounts(res.data.counts || {});
    } catch (err) {
      console.error('Failed to load partner applications:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const totalPages = Math.ceil(total / LIMIT);
  const waiting = (counts.SUBMITTED || 0) + (counts.UNDER_REVIEW || 0);

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Partner queue · approvals</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Who gets to<br />
            <span className="cb-italic">trade here.</span>
          </h1>
        </div>
      </div>

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Waiting</div>
          <div className="cb-kpi-value" style={waiting > 0 ? { color: 'var(--cb-ember)' } : undefined}>{waiting}</div>
          <div className="cb-kpi-delta">oldest first</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Needs info</div>
          <div className="cb-kpi-value">{counts.NEEDS_INFO || 0}</div>
          <div className="cb-kpi-delta">with applicant</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Approved</div>
          <div className="cb-kpi-value">{counts.APPROVED || 0}</div>
          <div className="cb-kpi-delta">live partners</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Rejected</div>
          <div className="cb-kpi-value">{counts.REJECTED || 0}</div>
          <div className="cb-kpi-delta">may resubmit</div>
        </div>
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => { setStatusFilter(tab.value); setPage(0); }}
          >
            {tab.label}
            {tab.value && counts[tab.value] ? ` · ${counts[tab.value]}` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : apps.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">
            {statusFilter === 'SUBMITTED' ? 'Queue clear — nothing waiting on you.' : 'No applications match.'}
          </span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {apps.map((app) => (
            <ApplicationCard key={`${app.kind}-${app.id}`} app={app} onDone={fetchApps} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>← prev</button>
          <span>page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>next →</button>
        </div>
      )}
    </DashboardLayout>
  );
}
