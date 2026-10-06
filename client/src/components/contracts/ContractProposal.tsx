// =============================================================================
// ContractProposal — an FMCG buyer proposes a supply contract from a lot
// =============================================================================
// The website's twin of the app's card (mobile/components/ContractProposal):
// one price, a total, a batch size and how often, with the sum and number of
// batches worked out as the buyer types. The server holds the FMCG rule and
// the lot's price floor. Nothing here reserves the lot's stock (CLAUDE.md §9).
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { formatCurrency } from '../../utils/currency';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Listing } from '../../types';

const EVERY = [7, 14, 30];

export function ContractProposal({ listing }: { listing: Listing }) {
  const unit = listing.unit.toLowerCase();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState('');
  const [batch, setBatch] = useState('');
  const [every, setEvery] = useState(14);
  const [price, setPrice] = useState(String(listing.pricePerUnitMin));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const t = Number(total), b = Number(batch), p = Number(price);
  const batches = t > 0 && b > 0 && b <= t ? Math.ceil(t / b) : 0;
  const weeks = batches > 0 ? Math.round(((batches - 1) * every) / 7) : 0;

  async function send() {
    if (!(t > 0) || !(b > 0) || b > t) { toast.error('Enter a total and a batch no larger than it'); return; }
    if (!(p >= listing.pricePerUnitMin)) { toast.error(`The seller takes no less than ${formatCurrency(listing.pricePerUnitMin, 'INR')}/${unit}`); return; }
    setSending(true);
    try {
      await api.post('/contracts', { listingId: listing.id, totalQuantity: t, batchQuantity: b, everyDays: every, pricePerUnit: p, message: note.trim() || null });
      setSent(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not send it');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="cb-card" style={{ padding: 18 }}>
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)' }}>SUPPLY CONTRACT SENT</div>
        <div className="cb-small" style={{ marginTop: 4 }}>The seller can accept or decline it. Follow it in <Link to="/contracts">Contracts</Link>.</div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="cb-cp-closed" onClick={() => setOpen(true)}>
        <span>
          <strong>Need this every month?</strong>
          <span>Propose a supply contract: one price, delivered in batches.</span>
        </span>
        <span aria-hidden="true">→</span>
      </button>
    );
  }

  return (
    <div className="cb-card" style={{ padding: 20, display: 'grid', gap: 14 }}>
      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-sage)' }}>PROPOSE A SUPPLY CONTRACT</div>
      <div className="cb-cols-2" style={{ gap: 12 }}>
        <Input label={`Total (${unit})`} type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="300" />
        <Input label={`Each batch (${unit})`} type="number" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="50" />
      </div>
      <div>
        <div className="cb-small" style={{ fontWeight: 500, marginBottom: 6 }}>Deliver every</div>
        <div className="cb-pill-group">
          {EVERY.map((d) => (
            <button key={d} type="button" className={`cb-pill ${every === d ? 'active' : ''}`} onClick={() => setEvery(d)}>
              {d === 7 ? 'Week' : d === 14 ? '2 weeks' : 'Month'}
            </button>
          ))}
        </div>
      </div>
      <Input
        label={`Price per ${unit} (₹)`}
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        hint={`Their range is ${formatCurrency(listing.pricePerUnitMin, 'INR')} to ${formatCurrency(listing.pricePerUnitMax, 'INR')}. The price holds for every batch.`}
      />
      <Input label="A note to the seller (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      {batches > 0 && (
        <div style={{ background: 'var(--cb-paper-2)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1f2d18' }}>{formatCurrency(t * p, 'INR')}</div>
          <div className="cb-small" style={{ color: 'var(--cb-ink-2)' }}>
            {batches} {batches === 1 ? 'batch' : 'batches'} of up to {b} {unit}{batches > 1 ? `, over about ${weeks} weeks` : ''}. Each batch is a deal you pay before it moves.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button onClick={send} loading={sending}>Send to the seller</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
