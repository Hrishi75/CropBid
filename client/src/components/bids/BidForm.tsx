// =============================================================================
// BidForm — Place a new bid on a listing
// =============================================================================
// The buyer-side form for submitting a bid: price (with a floor/ideal range
// slider), quantity (capped at available), payment + delivery terms, an
// optional message, and agent mode. When agent mode is on the buyer also sets
// a walk-away price so the AI can auto-counter up to that ceiling.
//
// Validates against the listing's min price and available quantity before
// POSTing to /bids, then redirects to the buyer's bid list.
// =============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ArrowIcon } from '../ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { mspForCrop } from '../../utils/msp';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

interface BidFormProps {
  listing: Listing;
}

export function BidForm({ listing }: BidFormProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(String(listing.quantity));
  const [message, setMessage] = useState('');
  const [payment, setPayment] = useState<'LC' | 'NET7' | 'NET15'>('LC');
  const [delivery, setDelivery] = useState<'FOB' | 'CIF'>('CIF');
  // Prefilled from the profile — the seller sees these on the order
  const [deliveryAddress, setDeliveryAddress] = useState(user?.location ?? '');
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [agentMode, setAgentMode] = useState(true);
  const [walkAway, setWalkAway] = useState('');
  const [loading, setLoading] = useState(false);

  const bidPrice = parseFloat(price) || 0;
  const bidQty = parseFloat(quantity) || 0;
  const totalAmount = bidPrice * bidQty;
  const priceRange = listing.pricePerUnitMax - listing.pricePerUnitMin;
  const positionPct = bidPrice > 0 && priceRange > 0
    ? Math.min(100, Math.max(0, ((bidPrice - listing.pricePerUnitMin) / priceRange) * 100))
    : bidPrice > 0 ? 50 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (bidPrice < listing.pricePerUnitMin) {
      toast.error(`Bid must be at least ${formatCurrency(listing.pricePerUnitMin, listing.currency)}`);
      return;
    }
    if (bidQty > listing.quantity) {
      toast.error(`Only ${listing.quantity} ${listing.unit.toLowerCase()} available`);
      return;
    }
    // Government MSP guard — warn (but don't block) when the bid is below the
    // official support price. MSP is an India-only price in ₹, so only applies
    // to INR listings.
    const msp = mspForCrop(listing.cropName, listing.unit);
    if (msp != null && listing.currency.toUpperCase() === 'INR' && bidPrice < msp) {
      const proceed = window.confirm(
        `The government MSP for ${listing.cropName} is ${formatCurrency(msp, listing.currency)} per ${listing.unit.toLowerCase()}. ` +
          `Your bid of ${formatCurrency(bidPrice, listing.currency)} is below it.\n\nBid anyway?`,
      );
      if (!proceed) return;
    }
    setLoading(true);
    try {
      await api.post('/bids', {
        listingId: listing.id,
        bidPricePerUnit: bidPrice,
        quantity: bidQty,
        message: message || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        paymentTerms: payment,
        deliveryTerms: delivery,
        agentMode,
        walkAwayPrice: agentMode && walkAway ? parseFloat(walkAway) : undefined,
      });
      toast.success('Bid sent');
      navigate('/buyer/bids');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to place bid');
    } finally {
      setLoading(false);
    }
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 0', borderBottom: '1px solid var(--cb-line)' }}>
        <div className="cb-eyebrow">{title}</div>
        {children}
      </div>
    );
  }

  return (
    <div className="cb-card" style={{ padding: '4px 20px' }}>
      <form onSubmit={handleSubmit}>
        <Section title="Price">
          <Input
            label={`Per unit · min ${formatCurrency(listing.pricePerUnitMin, listing.currency)}`}
            type="number"
            placeholder="Enter your bid"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            min={listing.pricePerUnitMin}
          />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }} className="cb-tiny">
              <span>Floor {formatCurrency(listing.pricePerUnitMin, listing.currency)}</span>
              <span>Ideal {formatCurrency(listing.pricePerUnitMax, listing.currency)}</span>
            </div>
            <div className="cb-range-track">
              <div className="cb-range-fill" style={{ left: 0, right: 0 }} />
              {bidPrice > 0 && <div className="cb-range-marker" style={{ left: `${positionPct}%` }} />}
            </div>
          </div>
          <Input
            label={`Quantity · max ${listing.quantity} ${listing.unit.toLowerCase()}`}
            type="number"
            placeholder={`Max ${listing.quantity}`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          {bidPrice > 0 && bidQty > 0 && (
            <div style={{ padding: 12, background: 'var(--cb-paper-2)', borderRadius: 8 }}>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 4 }}>TOTAL</div>
              <div className="cb-mono" style={{ fontSize: 22, fontWeight: 500 }}>
                {formatCurrency(totalAmount, listing.currency)}
              </div>
            </div>
          )}
        </Section>

        <Section title="Terms">
          <div>
            <label className="cb-label">Payment</label>
            <div className="cb-pill-group">
              {[['LC', 'L/C'], ['NET7', 'NET-7'], ['NET15', 'NET-15']].map(([v, label]) => (
                <button key={v} type="button" className={`cb-pill ${payment === v ? 'active' : ''}`} onClick={() => setPayment(v as any)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="cb-label">Delivery</label>
            <div className="cb-pill-group">
              {[['FOB', 'FOB origin'], ['CIF', 'CIF dest']].map(([v, label]) => (
                <button key={v} type="button" className={`cb-pill ${delivery === v ? 'active' : ''}`} onClick={() => setDelivery(v as any)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Delivery details">
          <div>
            <label htmlFor="bid-address" className="cb-label">Deliver to</label>
            <textarea
              id="bid-address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              rows={2}
              placeholder="Warehouse / delivery address the seller should ship to"
              className="cb-input"
            />
          </div>
          <Input
            label="Contact phone"
            type="tel"
            placeholder="Number the seller can call about this order"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </Section>

        <Section title="Message">
          <div>
            <label htmlFor="bid-message" className="cb-label">To seller (optional)</label>
            <textarea
              id="bid-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="e.g., need protein cert attached on signing"
              className="cb-input"
            />
          </div>
        </Section>

        <Section title="Agent mode">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={!agentMode} onChange={() => setAgentMode(false)} style={{ accentColor: 'var(--cb-forest)' }} />
              <span><strong>Manual</strong> · I send this bid as-is</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={agentMode} onChange={() => setAgentMode(true)} style={{ accentColor: 'var(--cb-forest)' }} />
              <span><strong>Agent</strong> · auto-counter on your behalf</span>
            </label>
            {agentMode && (
              <Input
                label="Walk-away price"
                type="number"
                placeholder="Max you'll go"
                value={walkAway}
                onChange={(e) => setWalkAway(e.target.value)}
              />
            )}
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 12, padding: '18px 0' }}>
          <Button type="submit" size="lg" loading={loading}>
            Send bid
            <ArrowIcon />
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
