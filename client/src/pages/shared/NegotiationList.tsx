// =============================================================================
// Negotiation List — Shows all AI negotiations for the user
// =============================================================================
// Both farmers and buyers see their negotiations here.
// Each card shows the crop, counterparty, outcome, and a link to view details.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bot, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import api from '../../lib/axios';
import type { Negotiation } from '../../types';

export function NegotiationList() {
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get('/negotiations');
        setNegotiations(res.data);
      } catch (err) {
        console.error('Failed to load negotiations:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const outcomeConfig = {
    DEAL: { label: 'Deal Reached', icon: CheckCircle, color: 'text-status-success', bg: 'bg-green-50' },
    NO_DEAL: { label: 'No Deal', icon: XCircle, color: 'text-status-error', bg: 'bg-red-50' },
    IN_PROGRESS: { label: 'In Progress', icon: Clock, color: 'text-status-warning', bg: 'bg-yellow-50' },
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Bot className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">AI Negotiations</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : negotiations.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">No AI negotiations yet.</p>
              <p className="text-sm text-text-muted mt-1">
                Start a negotiation from any pending bid to let AI agents negotiate on your behalf.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {negotiations.map((neg) => {
              const outcome = outcomeConfig[neg.finalOutcome];
              const OutcomeIcon = outcome.icon;
              const roundCount = Array.isArray(neg.rounds) ? neg.rounds.length : 0;
              const listing = neg.listing;
              const buyerName = neg.bid?.buyer?.name || 'Unknown Buyer';
              const farmerName = listing?.farmer?.user?.name || 'Unknown Farmer';

              return (
                <Link
                  key={neg.id}
                  to={`/negotiations/${neg.id}`}
                  className="block"
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-text-primary">
                            {listing?.cropName || 'Unknown Crop'}
                            {listing?.cropVariety ? ` (${listing.cropVariety})` : ''}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${outcome.bg} ${outcome.color}`}>
                            <OutcomeIcon className="w-3 h-3" />
                            {outcome.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-text-muted">
                          <span>Farmer: {farmerName}</span>
                          <span>•</span>
                          <span>Buyer: {buyerName}</span>
                          <span>•</span>
                          <span>{roundCount} round{roundCount !== 1 ? 's' : ''}</span>
                        </div>

                        {neg.bid && (
                          <div className="mt-2 text-sm">
                            <span className="text-text-muted">Initial bid: </span>
                            <span className="font-medium text-text-primary">
                              {neg.bid.currency} {neg.bid.bidPricePerUnit}/{listing?.unit || 'unit'}
                            </span>
                          </div>
                        )}
                      </div>

                      <ArrowRight className="w-5 h-5 text-text-muted" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
