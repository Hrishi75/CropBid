// =============================================================================
// Auction List — Browse active and start new live auctions
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Clock, Users, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
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

interface Listing {
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
  const [myListings, setMyListings] = useState<Listing[]>([]);
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
      setMyListings(res.data.filter((l: Listing) => l.status === 'ACTIVE'));
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
      toast.success('Auction started!');
      setShowStartForm(false);
      fetchAuctions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start auction');
    } finally {
      setStarting(false);
    }
  }

  function getTimeLeft(endsAt: string) {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return 'Ending...';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Gavel className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold text-text-primary">Live Auctions</h1>
          </div>
          {isFarmer && (
            <Button onClick={() => setShowStartForm(!showStartForm)}>
              <Plus className="w-4 h-4 mr-2" />
              Start Auction
            </Button>
          )}
        </div>

        {/* Start auction form (farmer only) */}
        {showStartForm && isFarmer && (
          <Card className="mb-6">
            <h3 className="font-semibold text-text-primary mb-4">Start a New Auction</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Select Listing
                </label>
                <select
                  value={selectedListing}
                  onChange={(e) => setSelectedListing(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text focus:ring-2 focus:ring-accent"
                >
                  <option value="">Choose a listing...</option>
                  {myListings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.cropName} {l.cropVariety ? `(${l.cropVariety})` : ''} — {l.quantity} {l.unit}
                    </option>
                  ))}
                </select>
                {myListings.length === 0 && (
                  <p className="text-xs text-text-muted mt-1">No active listings available for auction.</p>
                )}
              </div>
              <Input
                label="Duration (minutes)"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min={5}
                max={60}
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={handleStartAuction} loading={starting} disabled={!selectedListing}>
                Start Auction
              </Button>
              <Button variant="outline" onClick={() => setShowStartForm(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Active auctions */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : auctions.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Gavel className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">No live auctions right now.</p>
              {isFarmer && (
                <p className="text-sm text-text-muted mt-1">
                  Start one from your active listings!
                </p>
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {auctions.map((auction) => (
              <Link
                key={auction.listingId}
                to={`/auctions/${auction.listingId}`}
                className="block"
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-text-primary text-lg">
                          {auction.cropName}
                        </h3>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-status-error animate-pulse">
                          <span className="w-2 h-2 bg-status-error rounded-full" />
                          LIVE
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1 text-text-muted">
                          <TrendingUp className="w-4 h-4" />
                          <span>
                            {auction.currency} {auction.currentPrice}/{auction.unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-text-muted">
                          <Gavel className="w-4 h-4" />
                          <span>{auction.bidCount} bids</span>
                        </div>
                        <div className="flex items-center gap-1 text-text-muted">
                          <Users className="w-4 h-4" />
                          <span>{auction.participantCount} watching</span>
                        </div>
                        <div className="flex items-center gap-1 text-text-muted">
                          <Clock className="w-4 h-4" />
                          <span>{getTimeLeft(auction.endsAt)}</span>
                        </div>
                      </div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-text-muted" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
