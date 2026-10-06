// =============================================================================
// RequirementDetail — One requirement and its offers inbox
// =============================================================================
// The buyer's decision screen. Header shows the requirement and how much of it
// is filled; below it, every offer received, grouped by status tabs (the same
// shape as IncomingBids).
//
// Two fetches rather than one: /requirements/:id gives the requirement, and
// /requirements/:id/offers gives the offers with the transaction links needed
// for the "View deal" affordance.
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { RequirementCard } from '../../components/requirements/RequirementCard';
import { RequirementOfferCard } from '../../components/requirements/RequirementOfferCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { BuyerRequirement, RequirementOffer } from '../../types';

// The intervals the server accepts (REPEAT_DAYS in requirement.service).
const REPEAT_CHOICES: Array<{ days: number | null; label: string }> = [
  { days: 3, label: '3 days' },
  { days: 7, label: 'Weekly' },
  { days: 14, label: '2 weeks' },
  { days: null, label: 'Off' },
];

/** Turn repeating on, change it, or stop it. Open and filled requests only. */
function RepeatCard({ requirement, onChange }: { requirement: BuyerRequirement; onChange: (r: BuyerRequirement) => void }) {
  const [saving, setSaving] = useState(false);
  if (requirement.status !== 'OPEN' && requirement.status !== 'FULFILLED') return null;
  const current = requirement.repeatEveryDays ?? null;

  async function choose(days: number | null) {
    if (days === current || saving) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/requirements/${requirement.id}/repeat`, { repeatEveryDays: days });
      onChange({ ...requirement, repeatEveryDays: data.repeatEveryDays, nextRepeatAt: data.nextRepeatAt });
      toast.success(days ? `Reposts every ${days} days` : 'Repeat stopped');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not change the repeat');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cb-card" style={{ padding: 20 }}>
      <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Repeat this request</div>
      <div className="cb-pill-group">
        {REPEAT_CHOICES.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={saving}
            className={`cb-pill ${current === c.days ? 'active' : ''}`}
            onClick={() => choose(c.days)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="cb-small" style={{ color: 'var(--cb-ink-3)', margin: '10px 0 0' }}>
        {current && requirement.nextRepeatAt
          ? `Next copy posts on ${new Date(requirement.nextRepeatAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, at the same price and quantity.`
          : 'Posts a fresh copy on a schedule, so a regular order needs no retyping.'}
      </p>
    </div>
  );
}

const STATUS_TABS = [
  { value: 'PENDING', label: 'Awaiting you' },
  // After you counter, the seller's move.
  { value: 'COUNTERED', label: 'You countered' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
];

export function RequirementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [requirement, setRequirement] = useState<BuyerRequirement | null>(null);
  const [offers, setOffers] = useState<RequirementOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('PENDING');

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    if (!id) return;
    try {
      const [r, o] = await Promise.all([
        api.get(`/requirements/${id}`),
        api.get(`/requirements/${id}/offers`),
      ]);
      setRequirement(r.data);
      setOffers(o.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load requirement');
      navigate('/buyer/requirements');
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': offers.length };
    for (const o of offers) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [offers]);

  const visible = useMemo(
    () => (tab ? offers.filter((o) => o.status === tab) : offers),
    [offers, tab],
  );

  // Attaching the parent requirement lets the offer card render units without
  // a second lookup — the /offers payload doesn't embed it.
  const withRequirement = useMemo(
    () => visible.map((o) => ({ ...o, requirement: requirement ?? undefined })),
    [visible, requirement],
  );

  const acceptedCount = counts.ACCEPTED || 0;

  if (loading) {
    return (
      <DashboardLayout>
        <Skeleton />
      </DashboardLayout>
    );
  }

  if (!requirement) return null;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/buyer/requirements" style={{ color: 'inherit', textDecoration: 'none' }}>Requirements</Link>
        {' / '}#{requirement.id.slice(-6).toUpperCase()}
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        {requirement.cropName} <span className="cb-italic">offers.</span>
      </h1>
      <p className="cb-page-lede">
        Accept an offer to close the deal. Each accepted fill becomes its own transaction.
      </p>

      <div className="cb-split-rail" style={{ gap: 24, marginTop: 28, alignItems: 'start' }}>
        <div className="cb-card" style={{ padding: 0 }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--cb-line)' }}>
            <div className="cb-pill-group">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`cb-pill ${tab === t.value ? 'active' : ''}`}
                  onClick={() => setTab(t.value)}
                >
                  {t.label}{counts[t.value] ? ` (${counts[t.value]})` : ''}
                </button>
              ))}
            </div>
          </div>

          {withRequirement.length === 0 ? (
            <div style={{ padding: 8 }}>
              <EmptyState
                title={tab === 'PENDING' ? 'Nothing awaiting you' : 'No offers here'}
                description={
                  tab === 'PENDING'
                    ? (requirement?.negotiateOnly
                      ? 'Sellers send their price here. Accept it, counter, or decline.'
                      : 'Sellers can fill this at your posted price without asking, or send a counter-offer that lands here.')
                    : 'Try another tab.'
                }
              />
            </div>
          ) : (
            withRequirement.map((o) => (
              <RequirementOfferCard key={o.id} offer={o} viewAs="buyer" onUpdate={fetchAll} />
            ))
          )}
        </div>

        <aside style={{ position: 'sticky', top: 76, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RequirementCard requirement={requirement} />
          <RepeatCard requirement={requirement} onChange={setRequirement} />

          {acceptedCount > 1 && (
            <div className="cb-card" style={{ padding: 20 }}>
              <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Paying for this</div>
              <p className="cb-small" style={{ color: 'var(--cb-ink-3)', margin: 0 }}>
                This requirement was filled by {acceptedCount} farmers, so it has {acceptedCount} separate
                deals — each with its own payment and delivery. Find them all on your Transactions page.
              </p>
              <Link to="/transactions" className="cb-btn cb-btn-link" style={{ padding: 0, marginTop: 10 }}>
                Go to transactions →
              </Link>
            </div>
          )}
        </aside>
      </div>
    </DashboardLayout>
  );
}
