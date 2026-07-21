// =============================================================================
// FarmerDashboard — Farmer home / overview
// =============================================================================
// Landing page for farmers. Everything shown is live: KPIs and the recent-bid
// list come from /listings/my, /bids/incoming and /transactions/stats, the
// agent card from /agent/config, and the rate strip from /rates/board. Sections
// with no data render an empty state — we never fill a gap with a sample row,
// since on a trading screen an illustrative price is indistinguishable from a
// real one.
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
  buyer?: { name?: string | null } | null;
  listing?: { cropName?: string | null; unit?: UnitCode | null } | null;
}

export function FarmerDashboard() {
  const { user } = useAuth();
  const [activeListings, setActiveListings] = useState(0);
  const [crops, setCrops] = useState<string[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [earnings, setEarnings] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [listingsRes, bidsRes, txStatsRes] = await Promise.all([
          api.get('/listings/my'),
          api.get('/bids/incoming'),
          api.get('/transactions/stats'),
        ]);

        const listings = listingsRes.data.listings ?? listingsRes.data;
        const active = Array.isArray(listings) ? listings.filter((l: any) => l.status === 'ACTIVE') : [];
        setActiveListings(active.length);
        setCrops([...new Set(active.map((l: any) => l.cropName).filter(Boolean))] as string[]);

        setBids(Array.isArray(bidsRes.data) ? bidsRes.data : []);
        setEarnings(txStatsRes.data.totalRevenue || 0);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // KPI aggregates sum ₹-native records; labelling them with the account's
  // display currency would mislabel the amounts (no FX conversion happens).
  const currency = 'INR';
  const firstName = user?.name?.split(/\s+/)[0] || user?.name || '';
  const pending = bids.filter((b) => b.status === 'PENDING');
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
            ? 'Loading your lots…'
            : activeListings === 0
              ? 'No lots are live right now. List a crop to start receiving bids.'
              : `${activeListings} ${activeListings === 1 ? 'lot' : 'lots'} live · ${pending.length} ${pending.length === 1 ? 'bid' : 'bids'} waiting on you.`}
        </p>
      </div>

      <AgentCard role="FARMER" watching={activeListings} />

      <div className="cb-kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <Kpi label="Active lots" value={activeListings} loading={loading} />
        <Kpi label="Bids waiting" value={pending.length} loading={loading} />
        <Kpi
          label="Earned"
          value={formatCurrency(earnings, currency)}
          hint="released from escrow"
          loading={loading}
        />
      </div>

      <Section
        eyebrow="Bids · on your lots"
        title="Recent bids"
        action={recent.length > 0 ? { to: '/farmer/bids', label: 'See all' } : undefined}
      >
        {loading ? (
          <EmptyState>Loading bids…</EmptyState>
        ) : recent.length === 0 ? (
          <EmptyState>No bids yet. They'll appear here as buyers respond to your lots.</EmptyState>
        ) : (
          <div className="cb-card" style={{ padding: 0, overflow: 'hidden' }}>
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
                {recent.map((b) => (
                  <tr key={b.id}>
                    <td className="cb-mono" style={{ color: 'var(--cb-ink-3)' }}>{timeAgo(b.createdAt)}</td>
                    <td style={{ color: 'var(--cb-ink)' }}>{b.buyer?.name || 'Buyer'}</td>
                    <td className="cb-mono" style={{ color: 'var(--cb-ink-2)' }}>{b.listing?.cropName || '—'}</td>
                    <td className="num cb-mono">
                      {formatCurrency(b.bidPricePerUnit, currency)}
                      {b.listing?.unit ? `/${UNIT_LABEL[b.listing.unit] ?? b.listing.unit}` : ''}
                    </td>
                    <td className="cb-mono cb-tiny" style={{ color: b.status === 'PENDING' ? 'var(--cb-ember)' : 'var(--cb-ink-3)' }}>
                      {b.status.toLowerCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section eyebrow="Mandi · today" title="Rates for your crops">
        <MarketRates crops={crops} />
      </Section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cb-eyebrow">Quick</span>
        <Link to="/farmer/listings/new" className="cb-btn cb-btn-primary">
          List a crop
          <ArrowIcon />
        </Link>
        <Link to="/farmer/bids" className="cb-btn cb-btn-ghost">
          Review bids
          <ArrowIcon />
        </Link>
      </div>
    </DashboardLayout>
  );
}
