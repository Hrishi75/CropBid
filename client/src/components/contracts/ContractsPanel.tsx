// =============================================================================
// ContractsPanel — a dashboard's view of its supply contracts
// =============================================================================
// The live ones only (proposed and active), up to three, each with how many
// batches are made and when the next falls due; the Contracts page has the
// rest and every action. Renders nothing for an account with no live contract,
// because most buyers and sellers will never have one and an empty panel on
// every dashboard would be noise. A failed fetch says so, because "no
// contracts" is a claim.
// =============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Section, EmptyState } from '../dashboard/DashboardPieces';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import { type Contract, CONTRACT_STATUS, contractDay } from './contract';

export function ContractsPanel({ side }: { side: 'BUYER' | 'SELLER' }) {
  const [list, setList] = useState<Contract[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let on = true;
    api.get('/contracts/mine')
      .then((r) => { if (on) setList(r.data.contracts ?? []); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);

  // What needs this side first (a proposal a seller must answer), then running
  // contracts, then proposals waiting on the other side.
  const rank = (c: Contract) => (c.status === 'PROPOSED' && side === 'SELLER' ? 0 : c.status === 'ACTIVE' ? 1 : 2);
  const live = (list ?? [])
    .filter((c) => c.status === 'PROPOSED' || c.status === 'ACTIVE')
    .sort((a, b) => rank(a) - rank(b));
  if (!failed && live.length === 0) return null;

  return (
    <Section eyebrow="Supply contracts" title="Delivered in batches" action={{ to: '/contracts', label: 'See all' }}>
      {failed ? (
        <EmptyState>Your contracts couldn't be loaded.</EmptyState>
      ) : (
        <div className="cb-bd-contracts">
          {live.slice(0, 3).map((c) => {
            const total = Math.ceil(c.totalQuantity / c.batchQuantity);
            const made = c.batches.length;
            const toPay = c.batches.filter((b) => b.transactions.some((t) => t.paymentStatus === 'AWAITING_PAYMENT')).length;
            const other = side === 'BUYER'
              ? c.farmer?.farmerProfile?.businessName || c.farmer?.name || 'the seller'
              : c.buyer?.buyerProfile?.companyName || c.buyer?.name || 'the buyer';
            const st = CONTRACT_STATUS[c.status];
            const unit = c.unit.toLowerCase();
            const waitingOnYou = c.status === 'PROPOSED' && side === 'SELLER';
            return (
              <Link key={c.id} to="/contracts" className={`cb-card cb-bd-contract ${waitingOnYou ? 'hot' : ''}`}>
                <div className="cb-bd-contract-top">
                  <span className="cb-bd-req-crop">{c.cropName}</span>
                  <span className="cb-mono cb-tiny" style={{ color: st.color }}>● {st.label}</span>
                </div>
                <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                  {side === 'BUYER' ? 'From' : 'For'} {other} · {formatCurrency(c.pricePerUnit, 'INR')}/{unit} · {c.batchQuantity} {unit} every {c.everyDays} days
                </div>
                {c.status === 'ACTIVE' ? (
                  <>
                    <div className="cb-bd-track"><div style={{ width: `${Math.max((made / total) * 100, 2)}%` }} /></div>
                    <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>
                      {made} OF {total} BATCHES MADE
                      {c.nextBatchAt ? ` · NEXT ${contractDay(c.nextBatchAt).toUpperCase()}` : ''}
                      {toPay > 0 ? <span style={{ color: 'var(--cb-ember)' }}> · {toPay} TO PAY</span> : null}
                    </div>
                  </>
                ) : (
                  <div className="cb-tiny" style={{ color: waitingOnYou ? 'var(--cb-ember)' : 'var(--cb-ink-3)' }}>
                    {waitingOnYou ? 'Waiting for your answer' : 'Waiting for the seller to answer'}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}
