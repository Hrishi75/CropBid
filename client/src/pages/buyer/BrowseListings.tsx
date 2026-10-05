// =============================================================================
// BrowseListings — Buyer marketplace browse
// =============================================================================
// The buyer's shopping view. Combines ListingFilters (search/crop/state/grade/
// price/sort) with a paginated, grid-or-row list of ListingCards from /browse.
// Filters and page sync into the query string; changing a filter resets to
// page 1. Each card links to ListingDetail / PlaceBid.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ListingCard } from '../../components/listings/ListingCard';
import { ListingFilters } from '../../components/listings/ListingFilters';
import { RatesBoard } from '../../components/listings/RatesBoard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { buysSmall } from '../../utils/smallBuyer';
import api from '../../lib/axios';
import { FRESH_PRODUCE_CROPS } from '../../utils/crops';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

// Smallest lot shown, in quintals (GET /browse minQuintals). 0 is no floor.
const LOT_SIZES = [0, 10, 50, 100];
type Scope = 'city' | 'state' | 'all';

export function BrowseListings() {
  const { user } = useAuth();
  // An exporter filling a container has no use for a 40 kg lot or a Grade C
  // one, so Grade A and 10+ quintals are on when they arrive, shown as chips
  // so what is hidden is never a secret. Filtered on the server, not over the
  // page, or the next page's matches would never show.
  const isExporter = user?.role === 'BUYER' && user.buyerProfile?.companyType === 'EXPORTER';
  const [minQuintals, setMinQuintals] = useState(isExporter ? 10 : 0);
  // A small buyer starts with lots in their own state, as in the app: a few
  // quintals are not worth freighting across the country.
  const small = buysSmall(user);
  const myCity = user?.location?.trim() ?? '';
  // Their state: a shop's own, or the state the lots in their city are listed
  // under, since a buyer account carries a city and no state.
  const ownState = user?.farmerProfile?.state?.trim() ?? '';
  const [cityState, setCityState] = useState('');
  const myState = ownState || cityState;
  useEffect(() => {
    if (!small || ownState || !myCity) return;
    api.get(`/browse?location=${encodeURIComponent(myCity)}&limit=1`)
      .then(({ data }) => setCityState(data.listings?.[0]?.state ?? ''))
      .catch(() => {});
  }, [small, ownState, myCity]);
  const [scope, setScope] = useState<Scope>(small && myCity ? 'state' : 'all');
  const [listings, setListings] = useState<(Listing & { _count?: { bids: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<'grid' | 'row'>('grid');

  const [filters, setFilters] = useState({
    search: '', crop: '', state: '', quality: isExporter ? 'A' : '',
    organic: '', freshProduce: '', priceMin: '', priceMax: '', sort: 'createdAt',
  });

  useEffect(() => { setPage(1); }, [filters, minQuintals, scope]);

  useEffect(() => {
    fetchListings();
  }, [filters, page, minQuintals, scope, myState]);

  async function fetchListings() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '12');
      if (filters.search) params.set('search', filters.search);
      if (filters.crop) params.set('crop', filters.crop);
      // Until their state is known, "their state" is their city.
      if ((scope === 'city' || (scope === 'state' && !myState)) && myCity) params.set('location', myCity);
      else if (scope === 'state' && myState) params.set('state', myState);
      else if (filters.state) params.set('state', filters.state);
      if (minQuintals > 0) params.set('minQuintals', String(minQuintals));
      // A seller on its buying side never sees its own lots, in the page or the count.
      if (user?.farmerProfile && user.id) params.set('excludeSellerUserId', user.id);
      if (filters.quality) params.set('quality', filters.quality);
      if (filters.organic) params.set('organic', filters.organic);
      if (filters.freshProduce === 'true' && !filters.crop) {
        params.set('crops', FRESH_PRODUCE_CROPS.join(','));
      }
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);
      if (filters.sort) {
        params.set('sort', filters.sort);
        params.set('order', filters.sort === 'pricePerUnitMin' ? 'asc' : 'desc');
      }
      const { data } = await api.get(`/browse?${params.toString()}`);
      setListings(data.listings);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        Marketplace · live · {total > 0 ? `${total} lots clearing` : 'loading'}
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Sourced from<br />
        <span className="cb-italic">20+ origins.</span>
      </h1>

      <div style={{ marginTop: 28 }}>
        <RatesBoard state={filters.state || undefined} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cb-pill-group">
          <button type="button" className={`cb-pill ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button type="button" className={`cb-pill ${view === 'row' ? 'active' : ''}`} onClick={() => setView('row')}>Table</button>
        </div>
        <Link to="/agent" className="cb-btn cb-btn-primary" style={{ marginLeft: 'auto' }}>
          Brief agent
          <ArrowIcon />
        </Link>
      </div>

      <div className="cb-split-filters" style={{ gap: 24, alignItems: 'start' }}>
        <ListingFilters filters={filters} onChange={setFilters} />

        <div>
          <div className="cb-bl-bar">
            {small && (
              <div className="cb-bl-group">
                <span className="cb-bl-label">Buy from</span>
                <div className="cb-pill-group">
                  {myCity && <button type="button" className={`cb-pill ${scope === 'city' ? 'active' : ''}`} onClick={() => setScope('city')}>{myCity}</button>}
                  {myState && <button type="button" className={`cb-pill ${scope === 'state' ? 'active' : ''}`} onClick={() => setScope('state')}>{myState}</button>}
                  <button type="button" className={`cb-pill ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All India</button>
                </div>
              </div>
            )}
            <div className="cb-bl-group">
              <span className="cb-bl-label">Lot size</span>
              <div className="cb-pill-group">
                {LOT_SIZES.map((q) => (
                  <button key={q} type="button" className={`cb-pill ${minQuintals === q ? 'active' : ''}`} onClick={() => setMinQuintals(q)}>
                    {q === 0 ? 'Any' : `${q}+ quintal`}
                  </button>
                ))}
              </div>
            </div>
            <div className="cb-bl-note">
              {loading ? 'Loading…' : `${total} ${total === 1 ? 'lot' : 'lots'}`}
              {scope === 'city' && myCity ? ` in ${myCity}` : scope === 'state' && myState ? ` in ${myState}` : ''}
              {isExporter && (filters.quality === 'A' || minQuintals > 0) ? ' · export-ready filters on' : ''}
              {small && scope !== 'all' && !loading && total === 0 ? ' · try a wider area' : ''}
            </div>
          </div>
          {loading ? (
            <div className={view === 'grid' ? 'cb-cards-sm' : ''} style={{ display: 'grid', gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={view === 'grid' ? 320 : 80} />)}
            </div>
          ) : listings.length === 0 ? (
            <EmptyState
              title="No lots match"
              description="Loosen filters or brief your agent to auto-bid as new lots land."
            />
          ) : view === 'grid' ? (
            <div className="cb-cards-sm" style={{ gap: 16 }}>
              {listings.map((l) => <ListingCard key={l.id} listing={l} variant="grid" />)}
            </div>
          ) : (
            <div className="cb-card" style={{ padding: 0 }}>
              {listings.map((l) => <ListingCard key={l.id} listing={l} variant="row" />)}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="cb-btn cb-btn-link"
                style={{ fontSize: 12 }}
              >
                ← prev
              </button>
              <span>page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="cb-btn cb-btn-link"
                style={{ fontSize: 12 }}
              >
                next →
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
