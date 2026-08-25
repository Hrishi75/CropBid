// =============================================================================
// BuyerDashboard — Buyer home / overview
// =============================================================================
// Landing page for buyers. Everything shown is live: KPIs and the recent-bid
// list come from /bids/my and /transactions/stats, the agent card from
// /agent/config, and the rate strip from /rates/board. Sections with no data
// render an empty state rather than a sample row.
//
// There is deliberately no "saved vs broker" tile here. We have no broker
// benchmark to compare against, so any such figure would be invented — and a
// fabricated savings number is the most misleading thing a procurement screen
// could show. Add it back only when a real benchmark feed exists.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ArrowIcon } from '../../components/ui/Brand';
import { Kpi, Section, EmptyState, AgentCard, MarketRates } from '../../components/dashboard/DashboardPieces';
import { UNIT_LABEL, type UnitCode } from '../landing/shared';
import { formatCurrency } from '../../utils/currency';
import { timeAgo, greeting } from '../../utils/time';
import api from '../../lib/axios';

interface Bid {
  id: string;
  status: string;
  bidPricePerUnit: number;
  createdAt: string;
  listing?: {
    cropName?: string | null;
    unit?: UnitCode | null;
    farmer?: { name?: string | null } | null;
  } | null;
}

export function BuyerDashboard() {
  const { user } = useAuth();
  const [bids, setBids] = useState<Bid[]>([]);
  const [wonDeals, setWonDeals] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  // Per-feed, because the initial values (empty array, 0) are indistinguishable
  // from real answers once loading ends. Without these, a failed /bids/my tells
  // the buyer they have never bid, and a failed stats call reports zero spend.
  const [bidsFailed, setBidsFailed] = useState(false);
  const [statsFailed, setStatsFailed] = useState(false);

  useEffect(() => {
    // allSettled, not all: the bid feed and the spend totals are independent,
    // and with Promise.all a failing /transactions/stats threw away a
    // perfectly good /bids/my response — the buyer's working bids vanished
    // because an unrelated stats endpoint was down.
    async function load() {
      const [bidsRes, txStatsRes] = await Promise.allSettled([
        api.get('/bids/my'),
        api.get('/transactions/stats'),
      ]);

      if (bidsRes.status === 'fulfilled') {
        setBids(Array.isArray(bidsRes.value.data) ? bidsRes.value.data : []);
      } else {
        setBidsFailed(true);
        console.error('Failed to fetch bids:', bidsRes.reason);
      }

      if (txStatsRes.status === 'fulfilled') {
        setWonDeals(txStatsRes.value.data.released || 0);
        setTotalSpent(txStatsRes.value.data.totalRevenue || 0);
      } else {
        setStatsFailed(true);
        console.error('Failed to fetch transaction stats:', txStatsRes.reason);
      }

      setLoading(false);
    }
    load();
  }, []);

  // KPI aggregates sum ₹-native records; labelling them with the account's
  // display currency would mislabel the amounts (no FX conversion happens).
  const currency = 'INR';
  const firstName = user?.name?.split(/\s+/)[0] || user?.name || '';
  const working = bids.filter((b) => b.status === 'PENDING' || b.status === 'COUNTERED');
  const crops = [...new Set(bids.map((b) => b.listing?.cropName).filter(Boolean))] as string[];
  const recent = bids.slice(0, 5);

  return (
    <DashboardLayout>
      <div className="cb-page-head">
        <h1 className="cb-page-title">
          {greeting()},<br />
          <span className="cb-italic">{firstName}.</span>
        </h1>
        <p className="cb-page-lede">
          {loading
            ? 'Loading your bids…'
            : bidsFailed
              ? "Couldn't load your bids just now."
              : working.length === 0
                ? 'No bids working right now. Browse the marketplace to find lots.'
                : `${working.length} ${working.length === 1 ? 'bid' : 'bids'} working.`}
        </p>
      </div>

      <AgentCard role="BUYER" watching={working.length} />

      <div className="cb-kpi-strip" style={{ marginBottom: 24 }}>
        <Kpi label="Bids working" value={working.length} loading={loading} unavailable={bidsFailed} />
        <Kpi label="Deals won" value={wonDeals} loading={loading} unavailable={statsFailed} />
        <Kpi
          label="Spent"
          value={formatCurrency(totalSpent, currency)}
          hint="settled from escrow"
          loading={loading}
          unavailable={statsFailed}
        />
      </div>

      <Section
        eyebrow="Bids · yours"
        title="Recent bids"
        action={recent.length > 0 ? { to: '/buyer/bids', label: 'See all' } : undefined}
      >
        {loading ? (
          <EmptyState>Loading bids…</EmptyState>
        ) : bidsFailed ? (
          <EmptyState>Your bids couldn't be loaded. Refresh to try again.</EmptyState>
        ) : recent.length === 0 ? (
          <EmptyState>
            You haven't placed any bids yet.{' '}
            <Link to="/buyer/browse" className="cb-btn cb-btn-link">Browse the marketplace →</Link>
          </EmptyState>
        ) : (
          <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="cb-table-wrap">
              <table className="cb-table">
                <thead>
                  <tr>
                    <th style={{ width: 92 }}>When</th>
                    <th>Lot</th>
                    <th>Farmer</th>
                    <th className="num">Your bid</th>
                    <th style={{ width: 96 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((b) => (
                    <tr key={b.id}>
                      <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{timeAgo(b.createdAt)}</td>
                      <td style={{ color: 'var(--cb-ink)' }}>{b.listing?.cropName || '—'}</td>
                      <td className="cb-mono" style={{ color: 'var(--cb-ink-2)' }}>{b.listing?.farmer?.name || '—'}</td>
                      <td className="num cb-mono">
                        {formatCurrency(b.bidPricePerUnit, currency)}
                        {b.listing?.unit ? `/${UNIT_LABEL[b.listing.unit] ?? b.listing.unit}` : ''}
                      </td>
                      <td className="cb-mono cb-tiny" style={{ color: b.status === 'COUNTERED' ? 'var(--cb-ember)' : 'var(--cb-ink-3)' }}>
                        {b.status.toLowerCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section eyebrow="Mandi · today" title="Rates for crops you bid on">
        <MarketRates crops={crops} cropsUnavailable={bidsFailed} />
      </Section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cb-eyebrow">Quick</span>
        <Link to="/buyer/browse" className="cb-btn cb-btn-primary">
          Browse marketplace
          <ArrowIcon />
        </Link>
        <Link to="/agent" className="cb-btn cb-btn-ghost">
          Brief agent
          <ArrowIcon />
        </Link>
      </div>
    </DashboardLayout>
  );
}
