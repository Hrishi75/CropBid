// =============================================================================
// NegotiationChat — Replay of an agent negotiation
// =============================================================================
// Shows a single negotiation as a chat-style transcript of the offer/counter
// rounds between the two agents. Rounds reveal progressively for a "live" feel,
// and auto-scrolls to the latest. The user can intervene: walk away (stop the
// agent) or take it manual (pause the agent and bid the next round themselves).
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Negotiation, NegotiationRound } from '../../types';

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  IN_PROGRESS: { label: '●●● IN PROGRESS', color: 'var(--cb-ember)' },
  DEAL: { label: '● MATCH', color: 'var(--cb-sage)' },
  NO_DEAL: { label: '● NO DEAL', color: 'var(--cb-ink-3)' },
};

export function NegotiationChat() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleRounds, setVisibleRounds] = useState(0);
  const [actionLoading, setActionLoading] = useState<'walk-away' | 'take-manual' | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function handleWalkAway() {
    if (!id) return;
    if (!confirm('Walk away from this negotiation? Your agent will stop countering and the buyer/seller will be notified.')) return;
    setActionLoading('walk-away');
    try {
      // Endpoint not yet implemented on the server; surface a clear error
      // rather than silently no-op. The toast catches the 404 and the
      // user is informed instead of being left wondering.
      await api.post(`/negotiations/${id}/walk-away`);
      toast.success('Walked away. Agent stopped.');
      const res = await api.get(`/negotiations/${id}`);
      setNegotiation(res.data);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        toast.error('Walk-away endpoint not yet available. Adjust strategy from Agent settings as a workaround.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to walk away');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTakeManual() {
    if (!id) return;
    setActionLoading('take-manual');
    try {
      await api.post(`/negotiations/${id}/take-manual`);
      toast.success('Agent paused. Next round is yours.');
      const res = await api.get(`/negotiations/${id}`);
      setNegotiation(res.data);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        toast.error('Manual takeover endpoint not yet available. Pause the agent from Agent settings instead.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to take manual control');
      }
    } finally {
      setActionLoading(null);
    }
  }

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

  useEffect(() => {
    if (!negotiation) return;
    const rounds = Array.isArray(negotiation.rounds) ? negotiation.rounds : [];
    if (visibleRounds >= rounds.length) return;
    const timer = setTimeout(() => setVisibleRounds((v) => v + 1), 350);
    return () => clearTimeout(timer);
  }, [negotiation, visibleRounds]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleRounds]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">Loading negotiation…</div>
      </DashboardLayout>
    );
  }
  if (!negotiation) {
    return (
      <DashboardLayout>
        <div className="cb-card" style={{ textAlign: 'center', padding: 32 }}>
          <span className="cb-tiny">Negotiation not found.</span>
        </div>
      </DashboardLayout>
    );
  }

  const listing = negotiation.listing;
  const bid = negotiation.bid;
  const rounds: NegotiationRound[] = Array.isArray(negotiation.rounds) ? negotiation.rounds : [];
  const isFarmer = user?.role === 'FARMER';
  const outcome = OUTCOME_META[negotiation.finalOutcome];
  const finalPrice = rounds.length > 0 ? rounds[rounds.length - 1].price : bid?.bidPricePerUnit || 0;
  const currency = bid?.currency || 'INR';

  // price trail chart bounds
  const prices = [bid?.bidPricePerUnit || 0, ...rounds.map((r) => r.price)].filter((p) => p > 0);
  const minP = prices.length ? Math.min(...prices) * 0.95 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.05 : 100;

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/negotiations" style={{ color: 'inherit', textDecoration: 'none' }}>← Negotiations</Link> · #{negotiation.id.slice(-6).toUpperCase()}
      </div>

      <div className="cb-card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span className="cb-mono cb-tiny" style={{ color: outcome.color }}>{outcome.label} · Round {rounds.length}</span>
        </div>
        <h1 className="cb-h3" style={{ marginTop: 8, fontSize: 22 }}>
          {listing?.cropName || 'Crop'} · {bid?.quantity} {listing?.unit?.toLowerCase() || 'unit'}
        </h1>
        <div className="cb-small" style={{ marginTop: 6 }}>
          {listing?.farmer?.user?.name || 'Seller'} <span style={{ color: 'var(--cb-ink-3)' }}>←→</span> {bid?.buyer?.name || 'Buyer'}
        </div>
      </div>

      {prices.length > 1 && (
        <div className="cb-card" style={{ marginBottom: 16 }}>
          <div className="cb-eyebrow" style={{ marginBottom: 12 }}>Price trail</div>
          <svg width="100%" height="140" viewBox={`0 0 ${Math.max(prices.length * 80, 320)} 140`} preserveAspectRatio="none">
            {prices.map((p, i) => {
              const x = 30 + i * 80;
              const y = 130 - ((p - minP) / (maxP - minP || 1)) * 110;
              const isBuyer = i % 2 === 0;
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="6" fill={isBuyer ? '#6b8e4e' : '#c8602b'} />
                  <text x={x} y={140} fontSize="9" fill="#82806f" textAnchor="middle" fontFamily="monospace">R{i}</text>
                  <text x={x} y={y - 12} fontSize="10" fill="#14140f" textAnchor="middle" fontFamily="monospace">
                    {formatCurrency(p, currency)}
                  </text>
                  {i > 0 && (
                    <line
                      x1={30 + (i - 1) * 80}
                      y1={130 - ((prices[i - 1] - minP) / (maxP - minP || 1)) * 110}
                      x2={x}
                      y2={y}
                      stroke="#d8d4c8"
                      strokeWidth="1"
                      strokeDasharray="3 2"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div className="cb-tiny" style={{ marginTop: 8 }}>
            <span className="cb-dot cb-dot-sage" style={{ marginRight: 4 }} /> buyer/agent
            <span className="cb-dot cb-dot-ember" style={{ marginLeft: 12, marginRight: 4 }} /> seller/agent
          </div>
        </div>
      )}

      <div className="cb-card" style={{ padding: 0 }}>
        <div className="cb-eyebrow" style={{ padding: '16px 20px 0' }}>Thread</div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bid && (
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: 12, borderRadius: 12, background: 'rgba(200,96,43,0.06)', border: '1px solid rgba(200,96,43,0.2)' }}>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 4 }}>
                BUYER · {bid.buyer?.name || 'buyer'} · R0
              </div>
              <div style={{ fontSize: 13.5 }}>
                Opening at <strong>{formatCurrency(bid.bidPricePerUnit, currency)}/{listing?.unit?.toLowerCase()}</strong> for {bid.quantity} {listing?.unit?.toLowerCase()}.
              </div>
              {bid.message && <div className="cb-small" style={{ marginTop: 4, fontStyle: 'italic' }}>"{bid.message}"</div>}
            </div>
          )}

          {rounds.slice(0, visibleRounds).map((round, idx) => {
            const isFarmerAgent = round.from === 'farmer_agent';
            const showReasoning = isFarmer === isFarmerAgent;
            return (
              <div
                key={idx}
                style={{
                  alignSelf: isFarmerAgent ? 'flex-start' : 'flex-end',
                  maxWidth: '80%',
                  padding: 12, borderRadius: 12,
                  background: isFarmerAgent ? 'rgba(31,45,24,0.05)' : 'rgba(200,96,43,0.06)',
                  border: `1px solid ${isFarmerAgent ? 'rgba(31,45,24,0.15)' : 'rgba(200,96,43,0.2)'}`,
                  animation: 'cb-fade-in 0.3s ease-out',
                }}
              >
                <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 4 }}>
                  {isFarmerAgent ? 'SELLER' : 'BUYER'} · Round {round.round} · {round.action.toUpperCase()}
                </div>
                <div style={{ fontSize: 13.5 }}>
                  {round.action === 'counter' && <>Counter <strong>{formatCurrency(round.price, currency)}/{listing?.unit?.toLowerCase()}</strong></>}
                  {round.action === 'accept' && <>Accept <strong>{formatCurrency(round.price, currency)}/{listing?.unit?.toLowerCase()}</strong></>}
                  {round.action === 'reject' && <>Walk away. Final offer below floor.</>}
                </div>
                {showReasoning && round.reasoning && (
                  <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.5)', borderRadius: 6 }}>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>AGENT REASONING</div>
                    <div className="cb-small" style={{ fontSize: 12.5 }}>{round.reasoning}</div>
                  </div>
                )}
              </div>
            );
          })}

          {negotiation.finalOutcome !== 'IN_PROGRESS' && visibleRounds >= rounds.length && (
            <div className="cb-card cb-card-forest" style={{ alignSelf: 'stretch', marginTop: 8, textAlign: 'center', padding: 20 }}>
              <div className="cb-eyebrow" style={{ color: 'rgba(244,241,234,0.55)', marginBottom: 6 }}>{outcome.label}</div>
              {negotiation.finalOutcome === 'DEAL' && (
                <>
                  <div className="cb-mono" style={{ fontSize: 24, fontWeight: 500, color: '#e0cf9e' }}>
                    {formatCurrency(finalPrice, currency)}/{listing?.unit?.toLowerCase()}
                  </div>
                  <div className="cb-tiny" style={{ color: 'rgba(244,241,234,0.7)', marginTop: 4 }}>
                    Settled after {rounds.length} round{rounds.length === 1 ? '' : 's'} · contract drafting
                  </div>
                </>
              )}
              {negotiation.finalOutcome === 'NO_DEAL' && (
                <div className="cb-tiny" style={{ color: 'rgba(244,241,234,0.7)' }}>Walk-away triggered after {rounds.length} rounds.</div>
              )}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="cb-card" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="cb-small">
          Agent watching · auto-counter within configured guardrails
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/agent" className="cb-btn cb-btn-ghost" style={{ fontSize: 12.5 }}>⚙ Adjust strategy</Link>
          <button
            type="button"
            className="cb-btn cb-btn-ghost"
            style={{ fontSize: 12.5 }}
            onClick={handleTakeManual}
            disabled={actionLoading !== null || negotiation.finalOutcome !== 'IN_PROGRESS'}
          >
            ✋ {actionLoading === 'take-manual' ? 'Pausing…' : 'Take manual'}
          </button>
          <button
            type="button"
            className="cb-btn cb-btn-link"
            style={{ fontSize: 12.5, color: 'var(--cb-ember)' }}
            onClick={handleWalkAway}
            disabled={actionLoading !== null || negotiation.finalOutcome !== 'IN_PROGRESS'}
          >
            ⛔ {actionLoading === 'walk-away' ? 'Walking…' : 'Walk away'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
