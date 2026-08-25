// =============================================================================
// AuctionList — Live auctions index
// =============================================================================
// Shows every currently-running auction (crop, current price, winner, bid count,
// time left) with a link into each AuctionRoom. Farmers additionally get a
// "start auction" form that picks one of their active listings and a duration,
// then opens it for live bidding.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

interface ActiveAuction {
  listingId: string;
  cropName: string;
  unit: string;
  currency: string;
  startPrice: number;
  currentPrice: number;
  currentWinner: string | null;
  bidCount: number;
  participantCount: number;
  endsAt: string;
  farmerId: string;
}

interface ListingLite {
  id: string;
  cropName: string;
  cropVariety?: string;
  quantity: number;
  unit: string;
  pricePerUnitMin: number;
  currency: string;
  status: string;
}

export function AuctionList() {
  const { user } = useAuth();
  const [auctions, setAuctions] = useState<ActiveAuction[]>([]);
  const [myListings, setMyListings] = useState<ListingLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStartForm, setShowStartForm] = useState(false);
  const [selectedListing, setSelectedListing] = useState('');
  const [duration, setDuration] = useState('10');
  const [starting, setStarting] = useState(false);

  const isFarmer = user?.role === 'FARMER';

  useEffect(() => {
    fetchAuctions();
    if (isFarmer) fetchMyListings();
  }, []);

  async function fetchAuctions() {
    try {
      const res = await api.get('/auctions');
      setAuctions(res.data);
    } catch (err) {
      console.error('Failed to load auctions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyListings() {
    try {
      const res = await api.get('/listings/my');
      const listings = res.data.listings ?? res.data;
      setMyListings(Array.isArray(listings) ? listings.filter((l: ListingLite) => l.status === 'ACTIVE') : []);
    } catch (err) {
      console.error('Failed to load listings:', err);
    }
  }

  async function handleStartAuction() {
    if (!selectedListing) return;
    setStarting(true);
    try {
      await api.post('/auctions/start', {
        listingId: selectedListing,
        durationMinutes: parseInt(duration) || 10,
      });
      toast.success('Auction started');
      setShowStartForm(false);
      fetchAuctions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start auction');
    } finally {
      setStarting(false);
    }
  }

  function timeLeft(endsAt: string) {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return '0:00';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        Auctions · live · {auctions.length} clearing now
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        {auctions.length} auctions<br />
        <span className="cb-italic">clearing now.</span>
      </h1>

      {isFarmer && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 28, marginBottom: 16 }}>
          <Button onClick={() => setShowStartForm(!showStartForm)}>
            Start auction
            <ArrowIcon />
          </Button>
        </div>
      )}

      {showStartForm && isFarmer && (
        <div className="cb-card" style={{ marginBottom: 24 }}>
          <div className="cb-eyebrow" style={{ marginBottom: 12 }}>Start auction</div>
          <div className="cb-split-2-1" style={{ gap: 14 }}>
            <div>
              <label className="cb-label">Select listing</label>
              <select value={selectedListing} onChange={(e) => setSelectedListing(e.target.value)} className="cb-input">
                <option value="">Choose a listing…</option>
                {myListings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.cropName}{l.cropVariety ? ` (${l.cropVariety})` : ''} — {l.quantity} {l.unit.toLowerCase()}
                  </option>
                ))}
              </select>
              {myListings.length === 0 && <p className="cb-field-hint">No active listings available for auction.</p>}
            </div>
            <Input
              label="Duration (min)"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min={5}
              max={60}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <Button onClick={handleStartAuction} loading={starting} disabled={!selectedListing}>
              Open auction
              <ArrowIcon />
            </Button>
            <Button variant="ghost" onClick={() => setShowStartForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="cb-card" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="cb-tiny">Loading…</span>
        </div>
      ) : auctions.length === 0 ? (
        <EmptyState
          title="No live auctions"
          description={isFarmer ? 'Start one from your active listings.' : 'Auctions will appear here as they go live.'}
        />
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {auctions.map((a, i) => {
            const left = timeLeft(a.endsAt);
            const ending = left.startsWith('0:') && parseInt(left.split(':')[1]) < 60;
            return (
              <Link
                key={a.listingId}
                to={`/auctions/${a.listingId}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '18px 20px', borderBottom: i < auctions.length - 1 ? '1px solid var(--cb-line)' : 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                  <div>
                    <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
                      #A-{a.listingId.slice(-4).toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 500 }}>{a.cropName}</span>
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: ending ? 'var(--cb-ember)' : 'var(--cb-ink-3)' }}>
                    <span className="cb-live-dot sm" style={{ marginRight: 6 }} />
                    {ending ? '⚠ ENDING' : 'LIVE'} · ◷ {left}
                  </span>
                </div>
                <div className="cb-metrics" style={{ gap: 14, marginTop: 12 }}>
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>CURRENT</div>
                    <div className="cb-mono" style={{ fontWeight: 500 }}>{formatCurrency(a.currentPrice, a.currency)}/{a.unit.toLowerCase()}</div>
                  </div>
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>BIDS</div>
                    <div className="cb-mono" style={{ fontWeight: 500 }}>{a.bidCount}</div>
                  </div>
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>WATCHING</div>
                    <div className="cb-mono" style={{ fontWeight: 500 }}>{a.participantCount}</div>
                  </div>
                  <div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>LEADING</div>
                    <div className="cb-mono" style={{ fontWeight: 500, fontSize: 13 }}>{a.currentWinner || '—'}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, color: 'var(--cb-ember)' }} className="cb-tiny">
                  Enter room →
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
