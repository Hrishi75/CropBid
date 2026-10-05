// =============================================================================
// ContractsPage — supply contracts, for either side (/contracts)
// =============================================================================
// The website's twin of the app's SupplyContracts section. Each card: the
// terms, progress (batches made, delivered, to pay), the next batch, and the
// moves open to this side: the seller accepts or declines a proposal, the
// buyer withdraws one, either ends an active contract. A batch is an ordinary
// deal, so paying it and confirming it happen in Transactions.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/dashboard/DashboardPieces';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import { formatCurrency } from '../../utils/currency';

interface Contract {
  id: string; buyerId: string; farmerId: string; cropName: string; cropVariety: string | null;
  unit: string; qualityGrade: string; pricePerUnit: number; totalQuantity: number; batchQuantity: number;
  everyDays: number; startsAt: string; message: string | null; status: 'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'DECLINED' | 'CANCELLED';
  nextBatchAt: string | null;
  buyer?: { name: string; buyerProfile?: { companyName?: string | null } | null };
  farmer?: { name: string; farmerProfile?: { businessName?: string | null } | null };
  batches: Array<{ id: string; transactions: Array<{ id: string; paymentStatus: string; deliveryStatus: string }> }>;
}

const STATUS: Record<Contract['status'], { label: string; color: string }> = {
  PROPOSED: { label: 'PROPOSED', color: 'var(--cb-ember)' },
  ACTIVE: { label: 'ACTIVE', color: 'var(--cb-sage)' },
  COMPLETED: { label: 'ALL BATCHES MADE', color: 'var(--cb-sage)' },
  DECLINED: { label: 'DECLINED', color: 'var(--cb-ink-3)' },
  CANCELLED: { label: 'ENDED', color: 'var(--cb-ink-3)' },
};
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function ContractsPage() {
  const { user } = useAuth();
  const side = user?.role === 'BUYER' ? 'BUYER' : 'SELLER';
  const [list, setList] = useState<Contract[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.get('/contracts/mine').then((r) => { setList(r.data.contracts); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { load(); }, []);

  async function act(id: string, fn: () => Promise<unknown>, done: string) {
    setBusy(id);
    try { await fn(); toast.success(done); await load(); }
    catch (err: any) { toast.error(err.response?.data?.message || 'Could not do that'); }
    finally { setBusy(null); }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-head">
        <div className="cb-page-eyebrow">Supply contracts</div>
        <h1 className="cb-page-title">One price,<br /><span className="cb-italic">delivered in batches.</span></h1>
        <p className="cb-page-lede">
          {side === 'BUYER'
            ? 'Propose one from a lot’s page. Each batch becomes a deal you pay before it moves.'
            : 'Buyers propose these from your lots. Each batch becomes a deal the buyer pays before you send it; CropBid books the transport, billed to you.'}
        </p>
      </div>

      {failed ? (
        <EmptyState>Contracts couldn't be loaded. Refresh to try again.</EmptyState>
      ) : list == null ? (
        <EmptyState>Loading…</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          No supply contracts yet.{side === 'BUYER' && <> <Link to="/buyer/browse" className="cb-btn cb-btn-link">Find a lot →</Link></>}
        </EmptyState>
      ) : (
        <div className="cb-ct-grid">
          {list.map((c) => {
            const unit = c.unit.toLowerCase();
            const total = Math.ceil(c.totalQuantity / c.batchQuantity);
            const made = c.batches.length;
            const delivered = c.batches.filter((b) => b.transactions.some((t) => t.deliveryStatus === 'CONFIRMED')).length;
            const toPay = c.batches.filter((b) => b.transactions.some((t) => t.paymentStatus === 'AWAITING_PAYMENT')).length;
            const other = side === 'BUYER'
              ? c.farmer?.farmerProfile?.businessName || c.farmer?.name || 'The seller'
              : c.buyer?.buyerProfile?.companyName || c.buyer?.name || 'The buyer';
            const st = STATUS[c.status];
            return (
              <div key={c.id} className={`cb-card cb-ct ${c.status === 'PROPOSED' && side === 'SELLER' ? 'hot' : ''}`}>
                <div className="cb-ct-top">
                  <div>
                    <div className="cb-ct-crop">{c.cropName}{c.cropVariety ? ` · ${c.cropVariety}` : ''}</div>
                    <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>{side === 'BUYER' ? 'From' : 'For'} {other} · Grade {c.qualityGrade}</div>
                  </div>
                  <span className="cb-mono cb-tiny" style={{ color: st.color }}>● {st.label}</span>
                </div>
                <div className="cb-ct-terms">
                  <div><span>PRICE</span><strong>{formatCurrency(c.pricePerUnit, 'INR')}</strong><em>per {unit}</em></div>
                  <div><span>TOTAL</span><strong>{c.totalQuantity} {unit}</strong><em>{formatCurrency(c.pricePerUnit * c.totalQuantity, 'INR')}</em></div>
                  <div><span>BATCHES</span><strong>{c.batchQuantity} {unit}</strong><em>every {c.everyDays} days</em></div>
                </div>
                {c.status !== 'PROPOSED' && c.status !== 'DECLINED' && (
                  <div>
                    <div className="cb-bd-track"><div style={{ width: `${Math.max((made / total) * 100, 2)}%` }} /></div>
                    <div className="cb-small" style={{ marginTop: 6 }}>
                      {made} of {total} batches made · {delivered} delivered{toPay > 0 ? ` · ${toPay} to pay` : ''}
                      {toPay > 0 && <> · <Link to="/transactions">open in Transactions</Link></>}
                    </div>
                  </div>
                )}
                {c.status === 'ACTIVE' && c.nextBatchAt && <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>Next batch on {day(c.nextBatchAt)}.</div>}
                {c.status === 'PROPOSED' && (
                  <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                    First batch {new Date(c.startsAt) > new Date() ? `on ${day(c.startsAt)}` : side === 'SELLER' ? 'as soon as you accept' : 'as soon as they accept'}.
                  </div>
                )}
                {c.message && <div className="cb-small" style={{ fontStyle: 'italic', color: 'var(--cb-ink-2)' }}>“{c.message}”</div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {c.status === 'PROPOSED' && side === 'SELLER' && (
                    <>
                      <Button size="sm" loading={busy === c.id} onClick={() => act(c.id, () => api.put(`/contracts/${c.id}/respond`, { accept: true }), 'Contract accepted')}>Accept contract</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(c.id, () => api.put(`/contracts/${c.id}/respond`, { accept: false }), 'Contract declined')}>Decline</Button>
                    </>
                  )}
                  {((c.status === 'PROPOSED' && side === 'BUYER') || c.status === 'ACTIVE') && (
                    <Button size="sm" variant="link" onClick={() => act(c.id, () => api.put(`/contracts/${c.id}/cancel`), c.status === 'PROPOSED' ? 'Proposal withdrawn' : 'Contract ended')}>
                      {c.status === 'PROPOSED' ? 'Withdraw proposal' : 'End contract'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
