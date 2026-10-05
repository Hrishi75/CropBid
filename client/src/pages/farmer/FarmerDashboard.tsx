// =============================================================================
// FarmerDashboard — the seller's desk: what needs you, and where things stand
// =============================================================================
// Same shape as the buyer dashboard (pages/buyer/BuyerDashboard): the
// decisions waiting on this seller first, then recent bids, with a summary,
// the Selling | Buying switch, the AI helper and the day's rates beside them.
//
// Decisions, each a real state with a page to act on it:
//   - bids on your lots waiting for an answer
//   - a buyer's counter on one of your offers to a request
//   - supply-contract proposals
//   - paid orders to send (escrow, not yet on the way)
//
// Worded by seller kind (a shop holds stock, a farm and a wholesaler list
// lots), because "List a crop" on a kirana's dashboard is the wrong verb.
// Every feed that fails says so instead of reading as zero.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ArrowIcon } from '../../components/ui/Brand';
import { Section, EmptyState, AgentCard, MarketRates } from '../../components/dashboard/DashboardPieces';
import { PayoutCard } from '../../components/PayoutCard';
import { BuyStockCard } from '../../components/BuyStockCard';
import { ContractsPanel } from '../../components/contracts/ContractsPanel';
import { UNIT_LABEL, type UnitCode } from '../landing/shared';
import { formatCurrency } from '../../utils/currency';
import { timeAgo, greeting } from '../../utils/time';
import api from '../../lib/axios';

// A bid's state as the seller sees it: a waiting bid is the seller's move.
const SELLER_BID_PILL: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Answer', tone: 'hot' },
  COUNTERED: { label: 'You countered', tone: 'wait' },
  ACCEPTED: { label: 'Accepted', tone: 'good' },
  REJECTED: { label: 'Declined', tone: 'off' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'off' },
  EXPIRED: { label: 'Expired', tone: 'off' },
};

interface Bid {
  id: string;
  status: string;
  listingId: string;
  bidPricePerUnit: number;
  quantity: number;
  createdAt: string;
  buyer?: { name?: string | null; buyerProfile?: { companyName?: string | null } | null } | null;
  listing?: { cropName?: string | null; unit?: UnitCode | null } | null;
}
interface Tx { id: string; totalAmount: number; paymentStatus: string; deliveryStatus: string; listing?: { cropName?: string | null } | null }
interface Offer { id: string; status: string; buyerCounterPrice?: number | null; requirement?: { cropName?: string } | null }
interface Contract { id: string; status: string; cropName: string; totalQuantity: number; unit: string; buyer?: { name?: string; buyerProfile?: { companyName?: string | null } | null } }

interface Todo { key: string; hot: boolean; title: string; sub: string; to: string; cta: string }

export function FarmerDashboard() {
  const { user } = useAuth();
  const kind = user?.farmerProfile?.sellerType;
  const shop = kind === 'LOCAL_SHOP';
  const words = shop
    ? { lots: 'items on your shelf', lot: 'item on your shelf', list: 'Add stock' }
    : { lots: 'lots live', lot: 'lot live', list: kind === 'WHOLESALER' ? 'List a lot' : 'List a crop' };

  const [activeListings, setActiveListings] = useState(0);
  const [crops, setCrops] = useState<string[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [earnings, setEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    // allSettled: independent feeds, and one down must not blank the rest.
    (async () => {
      const [l, b, s, t, o, c] = await Promise.allSettled([
        api.get('/listings/my'),
        api.get('/bids/incoming'),
        api.get('/transactions/stats'),
        api.get('/transactions'),
        api.get('/requirements/offers/my'),
        api.get('/contracts/mine'),
      ]);
      const bad: string[] = [];
      if (l.status === 'fulfilled') {
        const listings = l.value.data.listings ?? l.value.data;
        const active = Array.isArray(listings) ? listings.filter((x: any) => x.status === 'ACTIVE') : [];
        setActiveListings(active.length);
        setCrops([...new Set(active.map((x: any) => x.cropName).filter(Boolean))] as string[]);
      } else bad.push('stock');
      if (b.status === 'fulfilled') setBids(Array.isArray(b.value.data) ? b.value.data : []); else bad.push('bids');
      if (s.status === 'fulfilled') setEarnings(s.value.data.totalRevenue || 0); else bad.push('earnings');
      if (t.status === 'fulfilled') setTxs(Array.isArray(t.value.data) ? t.value.data : t.value.data?.transactions ?? []); else bad.push('orders');
      // Offers and contracts are newer features; a seller without any is fine.
      if (o.status === 'fulfilled') setOffers(Array.isArray(o.value.data) ? o.value.data : []);
      if (c.status === 'fulfilled') setContracts(c.value.data?.contracts ?? []);
      setFailed(bad);
      setLoading(false);
    })();
  }, []);

  const firstName = user?.name?.split(/\s+/)[0] || user?.name || '';
  const pendingBids = bids.filter((b) => b.status === 'PENDING');
  const toSend = txs.filter((t) => t.paymentStatus === 'ESCROW' && t.deliveryStatus === 'PENDING');
  const awaitingPay = txs.filter((t) => t.paymentStatus === 'AWAITING_PAYMENT').reduce((n, t) => n + t.totalAmount, 0);

  const todos: Todo[] = [
    ...toSend.map((t) => ({
      key: `send-${t.id}`, hot: true, cta: 'Send',
      title: `Send the ${t.listing?.cropName ?? 'order'}`,
      sub: `${formatCurrency(t.totalAmount, 'INR')} is paid into escrow${shop ? '' : ' · CropBid books the transport'}`,
      to: `/transactions/${t.id}`,
    })),
    ...contracts.filter((c) => c.status === 'PROPOSED').map((c) => ({
      key: `contract-${c.id}`, hot: true, cta: 'Answer',
      title: `Supply contract offered: ${c.cropName}`,
      sub: `${c.buyer?.buyerProfile?.companyName || c.buyer?.name || 'A buyer'} wants ${c.totalQuantity} ${c.unit.toLowerCase()} in batches`,
      to: '/contracts',
    })),
    ...offers.filter((o) => o.status === 'COUNTERED').map((o) => ({
      key: `counter-${o.id}`, hot: true, cta: 'Answer',
      title: `The buyer countered on ${o.requirement?.cropName ?? 'your offer'}`,
      sub: o.buyerCounterPrice != null ? `They would pay ${formatCurrency(o.buyerCounterPrice, 'INR')}` : 'Accept their price or send a new one',
      to: '/farmer/offers',
    })),
    ...pendingBids.slice(0, 4).map((b) => ({
      key: `bid-${b.id}`, hot: false, cta: 'Review',
      title: `${b.buyer?.buyerProfile?.companyName || b.buyer?.name || 'A buyer'} bid on ${b.listing?.cropName ?? 'your lot'}`,
      sub: `${formatCurrency(b.bidPricePerUnit, 'INR')}${b.listing?.unit ? `/${UNIT_LABEL[b.listing.unit] ?? b.listing.unit}` : ''} · ${b.quantity} ${b.listing?.unit ? UNIT_LABEL[b.listing.unit] ?? '' : ''}`,
      to: '/farmer/bids',
    })),
  ];

  const lede = loading
    ? 'Loading your desk…'
    : todos.length > 0
      ? `${todos.length} ${todos.length === 1 ? 'thing needs' : 'things need'} you, starting below.`
      : activeListings > 0
        ? `${activeListings} ${activeListings === 1 ? words.lot : words.lots}, nothing waiting on you.`
        : `Nothing on sale right now. ${words.list} to start.`;

  const num = (v: number, what: string) => (failed.includes(what) ? '—' : loading ? '…' : String(v));

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

      {/* First, above everything: a seller with no payout details cannot be
          paid for anything the rest of this page is about. */}
      <PayoutCard />

      <div className="cb-bd-grid">
        <div className="cb-bd-main">
          <Section eyebrow="Needs you" title="Your decisions">
            {loading ? (
              <EmptyState>Loading…</EmptyState>
            ) : todos.length === 0 ? (
              <EmptyState>
                Nothing waiting on you.{' '}
                {!shop && <Link to="/demand" className="cb-btn cb-btn-link">See what buyers are asking for →</Link>}
              </EmptyState>
            ) : (
              <div className="cb-bd-todos">
                {todos.slice(0, 7).map((d) => (
                  <Link key={d.key} to={d.to} className={`cb-bd-todo ${d.hot ? 'hot' : 'calm'}`}>
                    <span className="cb-bd-todo-dot" aria-hidden="true" />
                    <span className="cb-bd-todo-text">
                      <span className="cb-bd-todo-title">{d.title}</span>
                      <span className="cb-bd-todo-sub">{d.sub}</span>
                    </span>
                    <span className="cb-bd-todo-cta">{d.cta} →</span>
                  </Link>
                ))}
                {pendingBids.length > 4 && (
                  <Link to="/farmer/bids" className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                    and {pendingBids.length - 4} more bids →
                  </Link>
                )}
              </div>
            )}
          </Section>

          {!shop && <ContractsPanel side="SELLER" />}

          {!shop && (
            <Section
              eyebrow="Bids · on your lots"
              title="Recent bids"
              action={bids.length > 0 ? { to: '/farmer/bids', label: 'See all' } : undefined}
            >
              {loading ? (
                <EmptyState>Loading…</EmptyState>
              ) : failed.includes('bids') ? (
                <EmptyState>Incoming bids couldn't be loaded.</EmptyState>
              ) : bids.length === 0 ? (
                <EmptyState>No bids yet. They appear here as buyers respond to your lots.</EmptyState>
              ) : (
                <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="cb-table-wrap">
                    <table className="cb-table">
                      <thead>
                        <tr>
                          <th style={{ width: 92 }}>When</th>
                          <th>Buyer</th>
                          <th>Lot</th>
                          <th className="num">Bid</th>
                          <th style={{ width: 96 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bids.slice(0, 5).map((b) => (
                          <tr key={b.id}>
                            <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{timeAgo(b.createdAt)}</td>
                            <td style={{ color: 'var(--cb-ink)' }}>{b.buyer?.buyerProfile?.companyName || b.buyer?.name || 'Buyer'}</td>
                            <td style={{ color: 'var(--cb-ink-2)' }}>{b.listing?.cropName || '—'}</td>
                            <td className="num cb-mono">
                              {formatCurrency(b.bidPricePerUnit, 'INR')}
                              {b.listing?.unit ? `/${UNIT_LABEL[b.listing.unit] ?? b.listing.unit}` : ''}
                            </td>
                            <td>
                              <span className={`cb-pill-status ${SELLER_BID_PILL[b.status]?.tone ?? 'off'}`}>
                                {SELLER_BID_PILL[b.status]?.label ?? b.status.toLowerCase()}
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
          )}

          <Section eyebrow="Mandi rates" title={shop ? 'Rates for what you stock' : 'Rates for your crops'} action={{ to: '/rates', label: 'All rates' }}>
            <MarketRates crops={crops} cropsUnavailable={failed.includes('stock')} />
          </Section>
        </div>

        <aside className="cb-bd-side">
          <div className="cb-bd-summary">
            {/* Before anything is released, the deals still to be paid are the
                number worth leading with; "₹0 earned" above ₹2 lakh in deals
                read as nothing happening. */}
            {!loading && !failed.includes('earnings') && earnings === 0 && awaitingPay > 0 ? (
              <>
                <div className="cb-mono cb-tiny cb-bd-summary-label">IN DEALS · BUYERS STILL TO PAY</div>
                <div className="cb-bd-summary-value">{formatCurrency(awaitingPay, 'INR')}</div>
                <div className="cb-bd-summary-sub">Nothing released yet. A deal is released to you once the buyer confirms delivery.</div>
              </>
            ) : (
              <>
                <div className="cb-mono cb-tiny cb-bd-summary-label">EARNED · RELEASED FROM ESCROW</div>
                <div className="cb-bd-summary-value">
                  {failed.includes('earnings') ? '—' : loading ? '…' : formatCurrency(earnings, 'INR')}
                </div>
                {awaitingPay > 0 && (
                  <div className="cb-bd-summary-sub">{formatCurrency(awaitingPay, 'INR')} more in deals waiting for the buyer to pay.</div>
                )}
              </>
            )}
            <div className="cb-bd-summary-row">
              <Link to="/farmer/listings"><strong>{num(activeListings, 'stock')}</strong><span>{shop ? 'on the shelf' : 'lots live'}</span></Link>
              <Link to="/farmer/bids"><strong>{num(pendingBids.length, 'bids')}</strong><span>bids waiting</span></Link>
              <Link to="/farmer/deliveries"><strong>{num(toSend.length, 'orders')}</strong><span>to send</span></Link>
            </div>
          </div>

          <div className="cb-bd-actions">
            <Link to="/farmer/listings/new" className="cb-btn cb-btn-primary">{words.list} <ArrowIcon /></Link>
            {!shop && <Link to="/demand" className="cb-btn cb-btn-ghost">What buyers are asking for</Link>}
          </div>

        </aside>

        <div className="cb-bd-late">
          <BuyStockCard />
          {!shop && <AgentCard role="FARMER" watching={activeListings} />}
        </div>
      </div>
    </DashboardLayout>
  );
}
