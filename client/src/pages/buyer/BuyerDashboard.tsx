// =============================================================================
// BuyerDashboard — what needs this buyer, and where things stand
// =============================================================================
// The website's twin of the app's buyer dashboard: first the decisions waiting
// on you (a deal to pay, a delivery to confirm, a seller's counter, offers on a
// request), then your open requests and recent bids, with a summary card,
// business credit and the day's mandi rates beside them.
//
// Every number is live. A feed that failed says so instead of reading as zero,
// because "nothing to pay" is a claim.
//
// Two things deliberately absent:
//   - a "saved vs broker" tile: there is no broker benchmark, so the figure
//     would be invented.
//   - the agent card: the buying agent is off in the app for now, and the
//     website matches it (the agent pages still exist at /agent).
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ArrowIcon } from '../../components/ui/Brand';
import { Section, EmptyState, MarketRates } from '../../components/dashboard/DashboardPieces';
import { CreditCard } from '../../components/credit/CreditCard';
import { ContractsPanel } from '../../components/contracts/ContractsPanel';
import { UNIT_LABEL, type UnitCode } from '../landing/shared';
import { formatCurrency } from '../../utils/currency';
import { timeAgo, greeting } from '../../utils/time';
import { postPath } from '../../utils/restock';
import api from '../../lib/axios';

interface Bid {
  id: string;
  status: string;
  listingId: string;
  bidPricePerUnit: number;
  counterPrice?: number | null;
  createdAt: string;
  listing?: { cropName?: string | null; unit?: UnitCode | null; farmer?: { user?: { name?: string | null } | null; businessName?: string | null } | null } | null;
}
interface Tx {
  id: string;
  totalAmount: number;
  paymentStatus: string;
  deliveryStatus: string;
  listing?: { cropName?: string | null } | null;
}
interface Req {
  id: string;
  cropName: string;
  quantity: number;
  remainingQuantity: number;
  unit: UnitCode;
  pricePerUnit: number;
  deliveryLocation: string;
  _count?: { offers?: number };
  negotiateOnly?: boolean;
  nextRepeatAt?: string | null;
  repeatEveryDays?: number | null;
}
interface Stats { total?: number; inEscrow?: number; released?: number; totalRevenue?: number }

type Tone = 'hot' | 'calm';

// A bid's state as a pill: the colour says whether it needs you.
const BID_PILL: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Waiting', tone: 'wait' },
  COUNTERED: { label: 'Countered', tone: 'hot' },
  ACCEPTED: { label: 'Accepted', tone: 'good' },
  REJECTED: { label: 'Declined', tone: 'off' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'off' },
  EXPIRED: { label: 'Expired', tone: 'off' },
};
interface Todo { key: string; tone: Tone; title: string; sub: string; to: string; cta: string }

export function BuyerDashboard() {
  const { user } = useAuth();
  const [bids, setBids] = useState<Bid[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    // allSettled: four independent feeds, and one being down must not blank
    // the other three.
    (async () => {
      const [b, t, r, s] = await Promise.allSettled([
        api.get('/bids/my'),
        api.get('/transactions'),
        api.get('/requirements/my', { params: { status: 'OPEN', limit: 50 } }),
        api.get('/transactions/stats'),
      ]);
      const bad: string[] = [];
      if (b.status === 'fulfilled') setBids(Array.isArray(b.value.data) ? b.value.data : []); else bad.push('bids');
      if (t.status === 'fulfilled') setTxs(Array.isArray(t.value.data) ? t.value.data : t.value.data?.transactions ?? []); else bad.push('deals');
      if (r.status === 'fulfilled') setReqs(r.value.data?.requirements ?? []); else bad.push('requests');
      if (s.status === 'fulfilled') setStats(s.value.data); else bad.push('stats');
      setFailed(bad);
      setLoading(false);
    })();
  }, []);

  const firstName = user?.name?.split(/\s+/)[0] || user?.name || '';
  const working = bids.filter((b) => b.status === 'PENDING' || b.status === 'COUNTERED');
  const crops = [...new Set(bids.map((b) => b.listing?.cropName).filter(Boolean))] as string[];

  // Everything waiting on this buyer, most urgent first. Each is a real state
  // with a page to act on it.
  const todos: Todo[] = [
    ...txs.filter((t) => t.paymentStatus === 'AWAITING_PAYMENT').map((t) => ({
      key: `pay-${t.id}`, tone: 'hot' as const, cta: 'Pay',
      title: `Pay for ${t.listing?.cropName ?? 'your deal'}`,
      sub: `${formatCurrency(t.totalAmount, 'INR')} · the seller sends it once you pay`,
      to: `/transactions/${t.id}`,
    })),
    ...txs.filter((t) => t.deliveryStatus === 'DELIVERED').map((t) => ({
      key: `confirm-${t.id}`, tone: 'calm' as const, cta: 'Confirm',
      title: `Did the ${t.listing?.cropName ?? 'delivery'} arrive?`,
      sub: 'Confirm it so the seller is due their money',
      to: `/transactions/${t.id}`,
    })),
    ...bids.filter((b) => b.status === 'COUNTERED').map((b) => ({
      key: `counter-${b.id}`, tone: 'hot' as const, cta: 'Answer',
      title: `Counter on ${b.listing?.cropName ?? 'your bid'}`,
      sub: `You bid ${formatCurrency(b.bidPricePerUnit, 'INR')} · they ask ${b.counterPrice != null ? formatCurrency(b.counterPrice, 'INR') : 'more'}`,
      to: `/buyer/bids`,
    })),
    ...reqs.filter((r) => (r._count?.offers ?? 0) > 0).map((r) => ({
      key: `offers-${r.id}`, tone: 'calm' as const, cta: 'Review',
      title: `${r._count!.offers} ${r._count!.offers === 1 ? 'offer' : 'offers'} on your ${r.cropName} request`,
      sub: 'Accept, counter or decline',
      to: `/buyer/requirements/${r.id}`,
    })),
  ];
  const toPay = txs.filter((t) => t.paymentStatus === 'AWAITING_PAYMENT').reduce((n, t) => n + t.totalAmount, 0);

  const lede = loading
    ? 'Loading your desk…'
    : todos.length > 0
      ? `${todos.length} ${todos.length === 1 ? 'thing needs' : 'things need'} you, starting below.`
      : working.length > 0
        ? `${working.length} ${working.length === 1 ? 'bid' : 'bids'} working, nothing waiting on you.`
        : 'Nothing waiting on you. Browse the market or post what you need.';

  const num = (v: number | undefined, what: string) => (failed.includes(what) ? '—' : loading ? '…' : String(v ?? 0));

  return (
    <DashboardLayout>
      <div className="cb-page-head">
        <h1 className="cb-page-title">
          {greeting()},<br />
          <span className="cb-italic">{firstName}.</span>
        </h1>
        <p className="cb-page-lede">{lede}</p>
      </div>

      {failed.length > 0 && (
        <div className="cb-small" style={{ color: 'var(--cb-ember)', marginBottom: 16 }}>
          Some of this could not be loaded ({failed.join(', ')}). Refresh to try again.
        </div>
      )}

      <div className="cb-bd-grid">
        <div className="cb-bd-main">
          {/* ---- decisions ------------------------------------------------- */}
          <Section eyebrow="Needs you" title="Your decisions">
            {loading ? (
              <EmptyState>Loading…</EmptyState>
            ) : todos.length === 0 ? (
              <EmptyState>
                Nothing waiting on you.{' '}
                <Link to="/buyer/browse" className="cb-btn cb-btn-link">Browse the market →</Link>
              </EmptyState>
            ) : (
              <div className="cb-bd-todos">
                {todos.slice(0, 6).map((d) => (
                  <Link key={d.key} to={d.to} className={`cb-bd-todo ${d.tone}`}>
                    <span className="cb-bd-todo-dot" aria-hidden="true" />
                    <span className="cb-bd-todo-text">
                      <span className="cb-bd-todo-title">{d.title}</span>
                      <span className="cb-bd-todo-sub">{d.sub}</span>
                    </span>
                    <span className="cb-bd-todo-cta">{d.cta} →</span>
                  </Link>
                ))}
                {todos.length > 6 && <div className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>and {todos.length - 6} more</div>}
              </div>
            )}
          </Section>

          <ContractsPanel side="BUYER" />

          {/* ---- open requests --------------------------------------------- */}
          <Section
            eyebrow="Demand · yours"
            title="Open requests"
            action={{ to: '/buyer/requirements', label: 'See all' }}
          >
            {loading ? (
              <EmptyState>Loading…</EmptyState>
            ) : failed.includes('requests') ? (
              <EmptyState>Your requests couldn't be loaded.</EmptyState>
            ) : reqs.length === 0 ? (
              <EmptyState>
                No open requests.{' '}
                <Link to={postPath(user)} className="cb-btn cb-btn-link">Post what you need →</Link>
              </EmptyState>
            ) : (
              <div className="cb-bd-reqs">
                {reqs.slice(0, 4).map((r) => {
                  const filled = r.quantity - r.remainingQuantity;
                  const pct = r.quantity > 0 ? (filled / r.quantity) * 100 : 0;
                  const offers = r._count?.offers ?? 0;
                  const unit = UNIT_LABEL[r.unit] ?? r.unit;
                  return (
                    <Link key={r.id} to={`/buyer/requirements/${r.id}`} className="cb-card cb-bd-req">
                      <div className="cb-bd-req-top">
                        <span className="cb-bd-req-crop">{r.cropName}</span>
                        {offers > 0 && <span className="cb-bd-badge">{offers} new</span>}
                      </div>
                      <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                        {formatCurrency(r.pricePerUnit, 'INR')}/{unit} · to {r.deliveryLocation}
                        {r.nextRepeatAt && r.repeatEveryDays ? ` · repeats every ${r.repeatEveryDays} days` : ''}
                      </div>
                      <div className="cb-bd-track"><div style={{ width: `${Math.max(pct, 2)}%` }} /></div>
                      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                        {filled} OF {r.quantity} {unit.toUpperCase()} FILLED
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ---- recent bids ----------------------------------------------- */}
          <Section
            eyebrow="Bids · yours"
            title="Recent bids"
            action={bids.length > 0 ? { to: '/buyer/bids', label: 'See all' } : undefined}
          >
            {loading ? (
              <EmptyState>Loading…</EmptyState>
            ) : failed.includes('bids') ? (
              <EmptyState>Your bids couldn't be loaded.</EmptyState>
            ) : bids.length === 0 ? (
              <EmptyState>
                No bids yet.{' '}
                <Link to="/buyer/browse" className="cb-btn cb-btn-link">Browse the market →</Link>
              </EmptyState>
            ) : (
              <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="cb-table-wrap">
                  <table className="cb-table">
                    <thead>
                      <tr>
                        <th style={{ width: 92 }}>When</th>
                        <th>Lot</th>
                        <th>Seller</th>
                        <th className="num">Your bid</th>
                        <th style={{ width: 96 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bids.slice(0, 5).map((b) => (
                        <tr key={b.id}>
                          <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{timeAgo(b.createdAt)}</td>
                          <td><Link to={`/listings/${b.listingId}`} style={{ color: 'var(--cb-ink)' }}>{b.listing?.cropName || '—'}</Link></td>
                          <td style={{ color: 'var(--cb-ink-2)' }}>{b.listing?.farmer?.businessName || b.listing?.farmer?.user?.name || '—'}</td>
                          <td className="num cb-mono">
                            {formatCurrency(b.bidPricePerUnit, 'INR')}
                            {b.listing?.unit ? `/${UNIT_LABEL[b.listing.unit] ?? b.listing.unit}` : ''}
                          </td>
                          <td>
                            <span className={`cb-pill-status ${BID_PILL[b.status]?.tone ?? 'off'}`}>
                              {BID_PILL[b.status]?.label ?? b.status.toLowerCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        </div>

        <aside className="cb-bd-side">
          {/* The one dark card: what has been spent and what is in flight. */}
          <div className="cb-bd-summary">
            {/* What is owed leads when there is any: it is the number that needs
                doing something about. Otherwise what has been spent. */}
            {toPay > 0 ? (
              <>
                <div className="cb-mono cb-tiny cb-bd-summary-label">TO PAY · {todos.filter((d) => d.key.startsWith('pay-')).length} DEALS</div>
                <div className="cb-bd-summary-value">{formatCurrency(toPay, 'INR')}</div>
                <div className="cb-bd-summary-sub">
                  {(stats?.totalRevenue ?? 0) > 0 ? `Spent so far ${formatCurrency(stats!.totalRevenue!, 'INR')}. ` : ''}Each seller sends once you pay.
                </div>
              </>
            ) : (
              <>
                <div className="cb-mono cb-tiny cb-bd-summary-label">SPENT · COMPLETED DEALS</div>
                <div className="cb-bd-summary-value">
                  {failed.includes('stats') ? '—' : loading ? '…' : formatCurrency(stats?.totalRevenue ?? 0, 'INR')}
                </div>
              </>
            )}
            <div className="cb-bd-summary-row">
              <Link to="/transactions"><strong>{num(stats?.total, 'stats')}</strong><span>deals</span></Link>
              <Link to="/transactions"><strong>{num(stats?.inEscrow, 'stats')}</strong><span>paid, in progress</span></Link>
              <Link to="/buyer/requirements"><strong>{num(reqs.length, 'requests')}</strong><span>open requests</span></Link>
            </div>
            {toPay > 0 && (
              <Link to={todos.find((d) => d.key.startsWith('pay-'))?.to ?? '/transactions'} className="cb-bd-summary-due">Pay now →</Link>
            )}
          </div>

          <div className="cb-bd-actions">
            <Link to="/buyer/browse" className="cb-btn cb-btn-primary">Browse the market <ArrowIcon /></Link>
            <Link to={postPath(user)} className="cb-btn cb-btn-ghost">Post what you need</Link>
          </div>

        </aside>

        <div className="cb-bd-late">
          <CreditCard />
          <Section eyebrow="Mandi rates" title="Rates you bid on" action={{ to: '/rates', label: 'All rates' }}>
            <MarketRates crops={crops} cropsUnavailable={failed.includes('bids')} limit={4} />
          </Section>
        </div>
      </div>
    </DashboardLayout>
  );
}
