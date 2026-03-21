// =============================================================================
// Auction Room — Live bidding interface with real-time updates
// =============================================================================
// HOW IT WORKS:
// 1. User enters this page → connects to Socket.io → joins the auction room
// 2. Server sends current auction state (price, bids, time remaining)
// 3. When someone bids, server pushes the update to ALL room participants
// 4. A countdown timer ticks down locally (no server polling needed)
// 5. Anti-sniping: if a bid comes in the last 30s, the timer extends
// 6. When timer hits 0, server declares a winner and broadcasts the result
//
// WHY LOCAL TIMER?
// The server sends `endsAt` (an absolute timestamp). The client calculates
// remaining time locally. This avoids sending "tick" events every second
// over the network — a single timestamp does the same job.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Gavel, Clock, Users, TrendingUp, ArrowLeft,
  Trophy, AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
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
  const endsAtRef = useRef<Date | null>(null);
  const bidListRef = useRef<HTMLDivElement>(null);

  // Format time remaining
  const formatTime = useCallback((ms: number) => {
    if (ms <= 0) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Connect to socket and join auction room
  useEffect(() => {
    if (!listingId || !user) return;

    const socket = getSocket(user.name);

    // Join the auction room
    socket.emit('auction:join', listingId);

    // Receive current state
    socket.on('auction:state', (state: AuctionState) => {
      setAuction(state);
      setBids(state.bids || []);
      setParticipants(state.participantCount);
      endsAtRef.current = new Date(state.endsAt);
      // Suggest a bid slightly higher than current
      setBidPrice(String(Math.ceil(state.currentPrice * 1.05)));
      setLoading(false);
    });

    // New bid arrived
    socket.on('auction:new_bid', (data: AuctionBid & { currentPrice: number; currentWinner: string; bidCount: number }) => {
      setBids((prev) => [...prev, { userId: data.userId, userName: data.userName, price: data.price, timestamp: data.timestamp }]);
      setAuction((prev) => prev ? { ...prev, currentPrice: data.currentPrice, currentWinner: data.currentWinner, bidCount: data.bidCount } : prev);
    });

    // Time extended (anti-sniping)
    socket.on('auction:time_extended', (data: { newEndTime: string }) => {
      endsAtRef.current = new Date(data.newEndTime);
    });

    // Participant count changed
    socket.on('auction:participant_count', (count: number) => {
      setParticipants(count);
    });

    // Auction ended
    socket.on('auction:ended', (result: AuctionEndResult) => {
      setEnded(result);
    });

    // Error
    socket.on('auction:error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    // If auction isn't active via socket, try REST
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

  // Countdown timer — updates every second using local calculation
  useEffect(() => {
    const interval = setInterval(() => {
      if (endsAtRef.current) {
        const remaining = endsAtRef.current.getTime() - Date.now();
        setTimeLeft(formatTime(remaining));
        if (remaining <= 0) {
          setTimeLeft('0:00');
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [formatTime]);

  // Auto-scroll bid list
  useEffect(() => {
    bidListRef.current?.scrollTo({ top: bidListRef.current.scrollHeight, behavior: 'smooth' });
  }, [bids]);

  const handleBid = () => {
    const price = parseFloat(bidPrice);
    if (!price || !auction) return;

    if (price <= auction.currentPrice) {
      setError(`Bid must be higher than ${auction.currency} ${auction.currentPrice}`);
      return;
    }

    const socket = getSocket(user?.name);
    socket.emit('auction:bid', { listingId, price });

    // Pre-fill next bid
    setBidPrice(String(Math.ceil(price * 1.05)));
  };

  const isFarmer = user?.id === auction?.farmerId;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <Link to="/auctions" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-3">
            <ArrowLeft className="w-4 h-4" />
            Back to Auctions
          </Link>
          <div className="flex items-center gap-3">
            <Gavel className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold text-text-primary">
              Live Auction: {auction?.cropName || 'Loading...'}
            </h1>
          </div>
        </div>

        {/* Auction ended overlay */}
        {ended && (
          <Card className="mb-6 border-2 border-accent">
            <div className="text-center py-6">
              <Trophy className="w-12 h-12 text-accent mx-auto mb-3" />
              <h2 className="text-xl font-bold text-text-primary mb-2">
                {ended.winner ? 'Auction Complete!' : 'Auction Ended — No Bids'}
              </h2>
              {ended.winner && (
                <>
                  <p className="text-text-secondary">
                    Winner: <span className="font-semibold">{ended.winner}</span>
                  </p>
                  <p className="text-2xl font-bold text-primary mt-2">
                    {auction?.currency} {ended.finalPrice}/{auction?.unit}
                  </p>
                  <p className="text-sm text-text-muted mt-1">
                    {ended.totalBids} total bid{ended.totalBids !== 1 ? 's' : ''}
                  </p>
                  {ended.winnerId === user?.id && (
                    <p className="text-accent font-semibold mt-3">You won this auction!</p>
                  )}
                </>
              )}
            </div>
          </Card>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Stats + Bid form */}
          <div className="lg:col-span-1 space-y-4">
            {/* Timer */}
            <Card>
              <div className="text-center">
                <Clock className={`w-6 h-6 mx-auto mb-1 ${timeLeft === '0:00' ? 'text-status-error' : 'text-primary'}`} />
                <p className="text-3xl font-mono font-bold text-text-primary">{timeLeft || '--:--'}</p>
                <p className="text-xs text-text-muted">Time Remaining</p>
              </div>
            </Card>

            {/* Current price */}
            <Card>
              <div className="text-center">
                <TrendingUp className="w-6 h-6 mx-auto mb-1 text-accent" />
                <p className="text-2xl font-bold text-primary">
                  {auction?.currency} {auction?.currentPrice}
                </p>
                <p className="text-xs text-text-muted">
                  {auction?.currentWinner ? `Leading: ${auction.currentWinner}` : 'No bids yet'}
                </p>
              </div>
            </Card>

            {/* Participants */}
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-text-muted" />
                  <span className="text-sm text-text-secondary">Participants</span>
                </div>
                <span className="font-semibold text-text-primary">{participants}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-text-muted" />
                  <span className="text-sm text-text-secondary">Total Bids</span>
                </div>
                <span className="font-semibold text-text-primary">{bids.length}</span>
              </div>
            </Card>

            {/* Bid form (buyers only) */}
            {!isFarmer && !ended && (
              <Card>
                <h3 className="font-semibold text-text-primary mb-3">Place Your Bid</h3>
                <div className="space-y-3">
                  <Input
                    label={`Bid Price (${auction?.currency}/${auction?.unit})`}
                    type="number"
                    value={bidPrice}
                    onChange={(e) => setBidPrice(e.target.value)}
                    min={(auction?.currentPrice || 0) + 1}
                    step="0.5"
                  />

                  {/* Quick bid buttons */}
                  <div className="flex gap-2">
                    {[5, 10, 20].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setBidPrice(String(Math.ceil((auction?.currentPrice || 0) * (1 + pct / 100))))}
                        className="flex-1 text-xs py-1.5 bg-surface-alt rounded hover:bg-surface-hover transition-colors"
                      >
                        +{pct}%
                      </button>
                    ))}
                  </div>

                  <Button
                    onClick={handleBid}
                    className="w-full"
                    disabled={timeLeft === '0:00'}
                  >
                    <Gavel className="w-4 h-4 mr-2" />
                    Place Bid
                  </Button>
                </div>
              </Card>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-status-error rounded-lg text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          {/* Right: Bid history */}
          <div className="lg:col-span-2">
            <Card>
              <h3 className="font-semibold text-text-primary mb-3">Bid History</h3>
              <div
                ref={bidListRef}
                className="max-h-[500px] overflow-y-auto space-y-2"
              >
                {bids.length === 0 ? (
                  <p className="text-center text-text-muted py-8">
                    No bids yet. Be the first to bid!
                  </p>
                ) : (
                  bids.map((bid, idx) => {
                    const isLatest = idx === bids.length - 1;
                    const isYou = bid.userId === user?.id;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-3 rounded-lg animate-fadeIn
                          ${isLatest ? 'bg-green-50 border border-green-200' : 'bg-surface-alt'}
                          ${isYou ? 'ring-2 ring-accent ring-opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                            {bid.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {bid.userName} {isYou ? '(You)' : ''}
                            </p>
                            <p className="text-xs text-text-muted">
                              {new Date(bid.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${isLatest ? 'text-primary text-lg' : 'text-text-primary'}`}>
                            {auction?.currency} {bid.price}
                          </p>
                          <p className="text-xs text-text-muted">/{auction?.unit}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
