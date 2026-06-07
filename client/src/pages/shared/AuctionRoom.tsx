// =============================================================================
// AuctionRoom — Live bidding screen (real-time)
// =============================================================================
// The real-time heart of an auction. Connects to Socket.io (see lib/socket) to
// receive live price/bid/participant updates and to place bids, while falling
// back to REST (/auctions, /listings) for the initial snapshot and lot quantity.
// Runs a local countdown to the auction end, then shows the result (winner /
// final price) when the server emits the end event.
//
// Cleans up its socket subscription on unmount via disconnectSocket().
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { getSocket, disconnectSocket } from '../../lib/socket';
import api from '../../lib/axios';

interface AuctionBid {
  userId: string;
  userName: string;
  price: number;
  timestamp: string;
}

interface AuctionState {
  listingId: string;
  cropName: string;
  unit: string;
  currency: string;
  startPrice: number;
  currentPrice: number;
  currentWinner: string | null;
  bidCount: number;
  participantCount: number;
  bids: AuctionBid[];
  endsAt: string;
  farmerId: string;
  // Some servers include the lot quantity in the auction snapshot. Others
  // omit it (it's only on the listing). We fetch the listing as a fallback
  // when this is missing so the bid-total preview reflects real volume.
  quantity?: number;
}

interface AuctionEndResult {
  listingId: string;
  winner: string | null;
  winnerId?: string;
  finalPrice: number;
  totalBids: number;
  message?: string;
}

export function AuctionRoom() {
  const { listingId } = useParams<{ listingId: string }>();
  const { user } = useAuth();
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [bidPrice, setBidPrice] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [participants, setParticipants] = useState(0);
  const [bids, setBids] = useState<AuctionBid[]>([]);
  const [ended, setEnded] = useState<AuctionEndResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lotQuantity, setLotQuantity] = useState<number | null>(null);
  const endsAtRef = useRef<Date | null>(null);

  const formatTime = useCallback((ms: number) => {
    if (ms <= 0) return '0:00';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (!listingId || !user) return;
    const socket = getSocket(user.name);

    socket.emit('auction:join', listingId);

    socket.on('auction:state', (state: AuctionState) => {
      setAuction(state);
      setBids(state.bids || []);
      setParticipants(state.participantCount);
      endsAtRef.current = new Date(state.endsAt);
      setBidPrice(String(Math.ceil(state.currentPrice * 1.05)));
      if (state.quantity) setLotQuantity(state.quantity);
      setLoading(false);
    });

    // Always fetch the listing to learn the lot quantity. Auction snapshots
    // may omit it, and without it the bid-total preview would be wrong.
    api.get(`/listings/${listingId}`)
      .then(({ data }) => {
        if (data?.quantity) setLotQuantity(data.quantity);
      })
      .catch(() => {
        // Non-fatal: the bid total preview will hide itself when quantity is null.
      });

    socket.on('auction:new_bid', (data: AuctionBid & { currentPrice: number; currentWinner: string; bidCount: number }) => {
      setBids((prev) => [...prev, { userId: data.userId, userName: data.userName, price: data.price, timestamp: data.timestamp }]);
      setAuction((prev) => prev ? { ...prev, currentPrice: data.currentPrice, currentWinner: data.currentWinner, bidCount: data.bidCount } : prev);
    });

    socket.on('auction:time_extended', (data: { newEndTime: string }) => {
      endsAtRef.current = new Date(data.newEndTime);
    });

    socket.on('auction:participant_count', (count: number) => setParticipants(count));

    socket.on('auction:ended', (result: AuctionEndResult) => setEnded(result));

    socket.on('auction:error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    const timer = setTimeout(async () => {
      if (loading) {
        try {
          const res = await api.get(`/auctions/${listingId}`);
          setAuction(res.data);
          setBids(res.data.bids || []);
          endsAtRef.current = new Date(res.data.endsAt);
          setBidPrice(String(Math.ceil(res.data.currentPrice * 1.05)));
        } catch {
          setError('Auction not found or has ended');
        } finally {
          setLoading(false);
        }
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      socket.emit('auction:leave', listingId);
      socket.off('auction:state');
      socket.off('auction:new_bid');
      socket.off('auction:time_extended');
      socket.off('auction:participant_count');
      socket.off('auction:ended');
      socket.off('auction:error');
      disconnectSocket();
    };
  }, [listingId, user]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (endsAtRef.current) {
        const remaining = endsAtRef.current.getTime() - Date.now();
        setTimeLeft(formatTime(remaining));
        if (remaining <= 0) setTimeLeft('0:00');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [formatTime]);

  function handleBid() {
    const price = parseFloat(bidPrice);
    if (!price || !auction) return;
    if (price <= auction.currentPrice) {
      setError(`Bid must be higher than ${formatCurrency(auction.currentPrice, auction.currency)}`);
      return;
    }
    const socket = getSocket(user?.name);
    socket.emit('auction:bid', { listingId, price });
    setBidPrice(String(Math.ceil(price * 1.05)));
  }

  const isFarmer = user?.id === auction?.farmerId;
  const isYouLeading = auction?.currentWinner === user?.name;
  const delta = auction ? auction.currentPrice - auction.startPrice : 0;
  const deltaPct = auction ? (delta / auction.startPrice) * 100 : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Loading auction…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/auctions" style={{ color: 'inherit', textDecoration: 'none' }}>← Auctions</Link> · Room #A-{listingId?.slice(-4).toUpperCase()}
      </div>

      <div className="cb-card cb-card-forest" style={{ marginTop: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="cb-live-dot" />
            <span className="cb-mono" style={{ fontSize: 14, color: '#e6efd9', fontWeight: 500 }}>
              LIVE · {auction?.cropName}
            </span>
          </div>
          <span className="cb-mono" style={{ fontSize: 28, fontWeight: 500, color: timeLeft.startsWith('0:') ? '#e0cf9e' : '#e6efd9', letterSpacing: '-0.02em' }}>
            ◷ {timeLeft || '--:--'}
          </span>
        </div>
        <div style={{ marginTop: 10, color: 'rgba(244,241,234,0.7)', fontSize: 13 }}>
          {auction?.bidCount} bids · {participants} watching · anti-snipe +2:00/late bid
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 16 }}>
        <div className="cb-card">
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Current price</div>
          <div className="cb-mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em' }}>
            {auction && formatCurrency(auction.currentPrice, auction.currency)}
          </div>
          <div className="cb-tiny" style={{ marginTop: 2 }}>/ {auction?.unit.toLowerCase()}</div>
          <div className="cb-mono cb-tiny" style={{ marginTop: 8, color: deltaPct > 0 ? 'var(--cb-sage)' : 'var(--cb-ink-3)' }}>
            {deltaPct > 0 ? '↑' : ''} {deltaPct.toFixed(1)}% from open
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--cb-line)' }}>
            <div className="cb-eyebrow" style={{ marginBottom: 4 }}>Leading</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {auction?.currentWinner || '— no bids yet'}
              {isYouLeading && <span className="cb-chip cb-chip-sage" style={{ marginLeft: 6 }}>YOU</span>}
            </div>
          </div>
        </div>

        <div className="cb-card" style={{ padding: 0 }}>
          <div className="cb-eyebrow" style={{ padding: '16px 20px 6px' }}>Bid ladder</div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {bids.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }} className="cb-tiny">No bids yet. Be the first.</div>
            ) : (
              [...bids].reverse().map((bid, idx) => {
                const isYou = bid.userId === user?.id;
                const isLatest = idx === 0;
                return (
                  <div
                    key={`${bid.timestamp}-${idx}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 20px', borderTop: idx > 0 ? '1px solid var(--cb-line)' : 'none',
                      background: isLatest ? 'rgba(200,96,43,0.05)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isLatest && <span className="cb-dot cb-dot-ember" />}
                      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                        {new Date(bid.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: isLatest ? 500 : 400 }}>
                        {bid.userName}{isYou && ' (you)'}
                      </span>
                    </div>
                    <span className="cb-mono" style={{ fontSize: 14, fontWeight: 500 }}>
                      {auction && formatCurrency(bid.price, auction.currency)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {!isFarmer && !ended && (
        <div className="cb-card" style={{ marginBottom: 16 }}>
          <div className="cb-eyebrow" style={{ marginBottom: 10 }}>Your bid</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'flex-end' }}>
            <Input
              label={`Min ${auction ? formatCurrency(auction.currentPrice + 1, auction.currency) : ''}`}
              type="number"
              value={bidPrice}
              onChange={(e) => setBidPrice(e.target.value)}
              min={(auction?.currentPrice || 0) + 1}
              step="0.5"
            />
            <div className="cb-mono" style={{ fontSize: 14, color: 'var(--cb-ink-3)', paddingBottom: 12 }}>
              {auction && lotQuantity && parseFloat(bidPrice) > 0
                ? `Total: ${formatCurrency(parseFloat(bidPrice) * lotQuantity, auction.currency)} (${lotQuantity} ${auction.unit.toLowerCase()})`
                : ''}
            </div>
          </div>
          <div className="cb-pill-group" style={{ marginTop: 10 }}>
            {[5, 10, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                className="cb-pill"
                onClick={() => setBidPrice(String(Math.ceil((auction?.currentPrice || 0) * (1 + pct / 100))))}
              >
                +{pct}%
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Button onClick={handleBid} disabled={timeLeft === '0:00'}>
              Place bid
              <ArrowIcon />
            </Button>
          </div>
          {error && (
            <div className="cb-small" style={{ marginTop: 10, padding: 10, background: 'rgba(200,96,43,0.08)', color: 'var(--cb-ember)', borderRadius: 6 }}>
              ⚠ {error}
            </div>
          )}
        </div>
      )}

      {isFarmer && (
        <div className="cb-card" style={{ marginBottom: 16 }}>
          <div className="cb-tiny" style={{ color: 'var(--cb-ember)' }}>⚠ You're the seller — cannot bid on own listing</div>
          {auction && (
            <div className="cb-mono" style={{ marginTop: 8 }}>
              Reserve {formatCurrency(auction.startPrice, auction.currency)} · cleared by {formatCurrency(delta, auction.currency)}
            </div>
          )}
        </div>
      )}

      {ended && (
        <div className="cb-card cb-card-forest" style={{ textAlign: 'center', padding: 32 }}>
          <div className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.55)', marginBottom: 12 }}>● Match</div>
          <h2 className="cb-h2" style={{ color: '#f4f1ea' }}>
            {ended.winner ? 'Auction complete' : 'No bids · auction ended'}
          </h2>
          {ended.winner && auction && (
            <>
              <div style={{ color: '#e6efd9', marginTop: 8 }}>Winner: {ended.winner}{ended.winnerId === user?.id && ' (YOU)'}</div>
              <div className="cb-mono" style={{ fontSize: 32, fontWeight: 500, color: '#e0cf9e', marginTop: 12 }}>
                {formatCurrency(ended.finalPrice, auction.currency)}
              </div>
              <div className="cb-tiny" style={{ color: 'rgba(244,241,234,0.65)', marginTop: 4 }}>
                {ended.totalBids} total bids · cleared open
              </div>
              <div style={{ marginTop: 20 }}>
                <Link to="/transactions" className="cb-btn cb-btn-ghost" style={{ background: 'rgba(255,255,255,0.08)', color: '#e6efd9', borderColor: 'rgba(255,255,255,0.2)' }}>
                  Review contract <ArrowIcon />
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
