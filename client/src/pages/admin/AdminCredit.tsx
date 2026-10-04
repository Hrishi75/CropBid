// =============================================================================
// AdminCredit — business buyers' applications for credit
// =============================================================================
// The only place an application is visible to anybody but the buyer who sent
// it. CROPBID DOES NOT LEND: this is the queue somebody works by reading an
// application, calling the buyer, and taking it to a lending partner. An
// approval records the limit a lender agreed to; nothing here puts a credit in
// anybody's wallet (CLAUDE.md §9).
//
// Every buyer agreed to their details being shared with lending partners before
// the row could exist, and the server refuses an application without it.
//
// Moves follow the server's rules, which are the ones that count: SUBMITTED to
// review or decline, IN_REVIEW to approve or decline, and a decision can be
// reopened. Declining needs a reason, because the buyer is shown it.
// =============================================================================

import { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

type Status = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'DECLINED';

interface Application {
  id: string;
  businessName: string;
  gstin: string | null;
  yearsInBusiness: number;
  monthlyPurchase: number;
  amountWanted: number;
  repaymentDays: number;
  purpose: string | null;
  contactPhone: string;
  consentAt: string;
  status: Status;
  approvedLimit: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    location: string | null;
    role: string;
    buyerProfile: { companyName: string | null; companyType: string | null; status: string } | null;
    farmerProfile: { sellerType: string | null; businessName: string | null } | null;
  } | null;
}

const TABS: { value: '' | Status; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'SUBMITTED', label: 'New' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DECLINED', label: 'Declined' },
];

const META: Record<Status, { label: string; color: string }> = {
  SUBMITTED: { label: 'NEW', color: 'var(--cb-ember)' },
  IN_REVIEW: { label: 'IN REVIEW', color: 'var(--cb-wheat)' },
  APPROVED: { label: 'APPROVED', color: 'var(--cb-sage)' },
  DECLINED: { label: 'DECLINED', color: 'var(--cb-ink-3)' },
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function AdminCredit() {
  const [status, setStatus] = useState<'' | Status>('');
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get(`/admin/credit-applications${status ? `?status=${status}` : ''}`);
      setApps(res.data.applications);
    } catch (err) {
      console.error('Failed to load credit applications:', err);
      // Said, not shown as an empty queue: "nothing waiting" is a claim.
      setFailed(true);
      setApps([]);
    } finally {
      setLoading(false);
    }
  }

  async function move(id: string, body: { status: Status; approvedLimit?: number; reviewNote?: string }) {
    try {
      await api.patch(`/admin/credit-applications/${id}`, body);
      toast.success(body.status === 'IN_REVIEW' ? 'Moved to review' : `Marked ${body.status.toLowerCase()}`);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  }

  const waiting = apps.filter((a) => a.status === 'SUBMITTED').length;
  const asked = apps.filter((a) => a.status === 'SUBMITTED' || a.status === 'IN_REVIEW')
    .reduce((s, a) => s + a.amountWanted, 0);

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">Business credit · {failed ? '—' : apps.length} shown</div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            Credit asked for,<br />
            <span className="cb-italic">waiting on a call.</span>
          </h1>
          <p className="cb-small" style={{ marginTop: 10, maxWidth: 620, color: 'var(--cb-ink-2)' }}>
            CropBid does not lend. Read the application, call the buyer, and take it to a lending
            partner. Approving records the limit a lender agreed to; it does not add credits to
            the buyer's wallet.
          </p>
        </div>
      </div>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">New</div>
          <div className="cb-kpi-value">{failed ? '—' : waiting}</div>
          <div className="cb-kpi-delta">nobody has picked up</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Open asks</div>
          <div className="cb-kpi-value">{failed ? '—' : rupees(asked)}</div>
          <div className="cb-kpi-delta">new and in review</div>
        </div>
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.value} type="button" className={`cb-pill ${status === t.value ? 'active' : ''}`} onClick={() => setStatus(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : failed ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">These applications could not be loaded. Refresh to try again.</span>
        </div>
      ) : apps.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">No applications match.</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {apps.map((a, i) => (
            <Row key={a.id} app={a} last={i === apps.length - 1} onMove={(body) => move(a.id, body)} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function Row({ app: a, last, onMove }: {
  app: Application;
  last: boolean;
  onMove: (body: { status: Status; approvedLimit?: number; reviewNote?: string }) => void;
}) {
  const [limit, setLimit] = useState(String(a.amountWanted));
  const [note, setNote] = useState('');
  const meta = META[a.status];
  const who = a.user;
  const kind = who?.buyerProfile?.companyType
    ? who.buyerProfile.companyType.replace(/_/g, ' ').toLowerCase()
    : null;
  // A seller in buying mode is still a FARMER account; worth knowing on a call.
  const seller = who?.role === 'FARMER' && who.farmerProfile?.sellerType
    ? `also sells (${who.farmerProfile.sellerType.replace('_', ' ').toLowerCase()})`
    : null;

  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>#C-{a.id.slice(-6).toUpperCase()}</span>
          <span style={{ fontWeight: 500 }}>{a.businessName}</span>
        </div>
        <span className="cb-mono cb-tiny" style={{ color: meta.color }}>● {meta.label}</span>
      </div>

      <div className="cb-small" style={{ marginBottom: 8 }}>
        {who?.name || 'Unknown'}
        {kind ? ` · ${kind}` : ''}
        {seller ? ` · ${seller}` : ''}
        {who?.location ? ` · ${who.location}` : ''} · {new Date(a.createdAt).toLocaleDateString()}
      </div>

      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-2)', marginBottom: 8 }}>
        asks {rupees(a.amountWanted)} over {a.repaymentDays} days · buys {rupees(a.monthlyPurchase)}/month · {a.yearsInBusiness} {a.yearsInBusiness === 1 ? 'year' : 'years'} running
        {a.gstin ? ` · GSTIN ${a.gstin}` : ' · no GSTIN given'}
      </div>

      {a.purpose && <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)' }}>“{a.purpose}”</div>}

      {a.status === 'APPROVED' && a.approvedLimit != null && (
        <div className="cb-small" style={{ marginBottom: 8 }}>Approved limit <strong>{rupees(a.approvedLimit)}</strong></div>
      )}
      {a.reviewNote && <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-3)' }}>Note to buyer: {a.reviewNote}</div>}

      <div className="cb-cols-2" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--cb-line)', gap: 12 }}>
        <div>
          <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>CALL</div>
          <div className="cb-mono" style={{ fontSize: 13 }}>{a.contactPhone}{who?.email ? ` · ${who.email}` : ''}</div>
        </div>
        <div>
          <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>AGREED TO SHARING</div>
          <div className="cb-mono" style={{ fontSize: 13 }}>{new Date(a.consentAt).toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 12 }}>
        {a.status === 'SUBMITTED' && (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onMove({ status: 'IN_REVIEW' })}>
            Start review →
          </button>
        )}
        {a.status === 'IN_REVIEW' && (
          <>
            <input
              className="cb-input"
              style={{ width: 140, padding: '6px 10px', fontSize: 13 }}
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Limit ₹"
              aria-label="Approved limit in rupees"
            />
            <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onMove({ status: 'APPROVED', approvedLimit: Number(limit) })}>
              Approve this limit →
            </button>
          </>
        )}
        {(a.status === 'SUBMITTED' || a.status === 'IN_REVIEW') && (
          <>
            <input
              className="cb-input"
              style={{ flex: '1 1 220px', padding: '6px 10px', fontSize: 13 }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why not (shown to the buyer)"
              aria-label="Reason for declining"
            />
            <button
              type="button"
              className="cb-btn cb-btn-link"
              style={{ fontSize: 12, color: 'var(--cb-ember)' }}
              disabled={!note.trim()}
              onClick={() => onMove({ status: 'DECLINED', reviewNote: note.trim() })}
            >
              Decline
            </button>
          </>
        )}
        {(a.status === 'APPROVED' || a.status === 'DECLINED') && (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onMove({ status: 'IN_REVIEW' })}>
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
