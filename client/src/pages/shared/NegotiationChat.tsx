// =============================================================================
// Negotiation Chat — Round-by-round playback of AI agent negotiation
// =============================================================================
// WHY A CHAT-LIKE UI?
// Negotiations are conversations — showing them as a timeline/chat makes
// the back-and-forth intuitive. Each "message" is a round where an agent
// made a decision. The farmer's agent appears on the left, buyer's on right.
//
// THE PLAYBACK EFFECT:
// When the page loads, rounds animate in one by one (200ms delay between each).
// This creates a "replay" effect that makes the negotiation feel alive,
// even though all rounds already happened server-side.
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Bot, ArrowLeft, CheckCircle, XCircle,
  TrendingUp, TrendingDown, Minus, Handshake, Ban,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import type { Negotiation, NegotiationRound } from '../../types';

export function NegotiationChat() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleRounds, setVisibleRounds] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get(`/negotiations/${id}`);
        setNegotiation(res.data);
      } catch (err) {
        console.error('Failed to load negotiation:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id]);

  // Animate rounds appearing one by one
  useEffect(() => {
    if (!negotiation) return;
    const rounds = Array.isArray(negotiation.rounds) ? negotiation.rounds : [];
    if (visibleRounds >= rounds.length) return;

    const timer = setTimeout(() => {
      setVisibleRounds((v) => v + 1);
    }, 400);

    return () => clearTimeout(timer);
  }, [negotiation, visibleRounds]);

  // Scroll to bottom as new rounds appear
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleRounds]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!negotiation) {
    return (
      <DashboardLayout>
        <Card>
          <p className="text-center text-text-muted py-8">Negotiation not found.</p>
        </Card>
      </DashboardLayout>
    );
  }

  const listing = negotiation.listing;
  const bid = negotiation.bid;
  const rounds: NegotiationRound[] = Array.isArray(negotiation.rounds) ? negotiation.rounds : [];
  const isFarmer = user?.role === 'FARMER';

  const outcomeConfig = {
    DEAL: { label: 'Deal Reached!', icon: Handshake, color: 'text-status-success', bg: 'bg-green-50 border-green-200' },
    NO_DEAL: { label: 'No Deal', icon: Ban, color: 'text-status-error', bg: 'bg-red-50 border-red-200' },
    IN_PROGRESS: { label: 'In Progress', icon: Bot, color: 'text-status-warning', bg: 'bg-yellow-50 border-yellow-200' },
  };

  const outcome = outcomeConfig[negotiation.finalOutcome];
  const OutcomeIcon = outcome.icon;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link to="/negotiations" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-3">
            <ArrowLeft className="w-4 h-4" />
            Back to Negotiations
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-text-primary">
                {listing?.cropName || 'Crop'} Negotiation
              </h1>
              <p className="text-sm text-text-muted mt-1">
                {listing?.farmer?.user?.name || 'Farmer'} ↔ {bid?.buyer?.name || 'Buyer'}
                {' • '}
                {bid?.quantity} {listing?.unit} at {bid?.currency} {bid?.bidPricePerUnit}/{listing?.unit} (initial)
              </p>
            </div>
          </div>
        </div>

        {/* Agent labels */}
        <div className="flex justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-green-700" />
            </div>
            <div className="text-sm">
              <p className="font-medium text-text-primary">Farmer Agent</p>
              <p className="text-xs text-text-muted">{listing?.farmer?.user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-right">
              <p className="font-medium text-text-primary">Buyer Agent</p>
              <p className="text-xs text-text-muted">{bid?.buyer?.name}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-700" />
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-surface-alt rounded-lg p-4 min-h-[300px] space-y-4">
          {/* Initial bid message */}
          <div className="flex justify-end">
            <div className="max-w-[70%] bg-blue-100 rounded-lg rounded-tr-none p-3">
              <p className="text-xs text-blue-600 font-medium mb-1">Buyer's Initial Bid</p>
              <p className="text-sm text-text-primary">
                Offering <span className="font-bold">{bid?.currency} {bid?.bidPricePerUnit}</span> per {listing?.unit} for {bid?.quantity} {listing?.unit}
              </p>
              {bid?.message && (
                <p className="text-xs text-text-muted mt-1 italic">"{bid.message}"</p>
              )}
            </div>
          </div>

          {/* Negotiation rounds */}
          {rounds.slice(0, visibleRounds).map((round, idx) => {
            const isFarmerAgent = round.from === 'farmer_agent';
            const ActionIcon = round.action === 'accept'
              ? CheckCircle
              : round.action === 'reject'
                ? XCircle
                : isFarmerAgent ? TrendingUp : TrendingDown;

            const actionLabel = round.action === 'accept'
              ? 'Accepted'
              : round.action === 'reject'
                ? 'Rejected'
                : 'Countered';

            const bubbleColor = isFarmerAgent
              ? 'bg-green-100 rounded-tl-none'
              : 'bg-blue-100 rounded-tr-none';

            const actionColor = round.action === 'accept'
              ? 'text-status-success'
              : round.action === 'reject'
                ? 'text-status-error'
                : 'text-accent';

            return (
              <div
                key={idx}
                className={`flex ${isFarmerAgent ? 'justify-start' : 'justify-end'} animate-fadeIn`}
              >
                <div className={`max-w-[70%] ${bubbleColor} rounded-lg p-3`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ActionIcon className={`w-4 h-4 ${actionColor}`} />
                    <span className={`text-xs font-semibold ${actionColor}`}>
                      Round {round.round}: {actionLabel}
                    </span>
                  </div>

                  {round.action === 'counter' && (
                    <p className="text-sm text-text-primary font-medium">
                      Counter: {bid?.currency || 'INR'} {round.price}/{listing?.unit || 'unit'}
                    </p>
                  )}

                  {round.action === 'accept' && (
                    <p className="text-sm text-text-primary font-medium">
                      Deal at {bid?.currency || 'INR'} {round.price}/{listing?.unit || 'unit'}
                    </p>
                  )}

                  <p className="text-xs text-text-muted mt-1 italic">
                    {isFarmer === isFarmerAgent
                      ? `"${round.reasoning}"`
                      : '(Agent reasoning hidden)'}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Outcome banner */}
          {visibleRounds >= rounds.length && negotiation.finalOutcome !== 'IN_PROGRESS' && (
            <div className={`border rounded-lg p-4 text-center ${outcome.bg} animate-fadeIn`}>
              <OutcomeIcon className={`w-8 h-8 mx-auto mb-2 ${outcome.color}`} />
              <p className={`font-semibold ${outcome.color}`}>{outcome.label}</p>
              {negotiation.finalOutcome === 'DEAL' && rounds.length > 0 && (
                <p className="text-sm text-text-muted mt-1">
                  Final price: {bid?.currency} {rounds[rounds.length - 1].price}/{listing?.unit} after {rounds.length} round{rounds.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Summary stats */}
        <Card className="mt-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-text-muted">Initial Bid</p>
              <p className="text-lg font-semibold text-text-primary">
                {bid?.currency} {bid?.bidPricePerUnit}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Rounds</p>
              <p className="text-lg font-semibold text-text-primary">{rounds.length}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Final Price</p>
              <p className="text-lg font-semibold text-text-primary">
                {negotiation.finalOutcome === 'DEAL' && rounds.length > 0
                  ? `${bid?.currency} ${rounds[rounds.length - 1].price}`
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
