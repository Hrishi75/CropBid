import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../utils/currency';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

interface BidFormProps {
  listing: Listing;
}

/**
 * WHY SHOW THE FLOOR PRICE?
 * Transparency builds trust. The farmer's minimum price is public so
 * buyers know the lowest acceptable bid. This reduces wasted bids
 * (rejected for being too low) and speeds up deal-making.
 */
export function BidForm({ listing }: BidFormProps) {
  const navigate = useNavigate();
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState(String(listing.quantity));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const bidPrice = parseFloat(price) || 0;
  const bidQty = parseFloat(quantity) || 0;
  const totalAmount = bidPrice * bidQty;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (bidPrice < listing.pricePerUnitMin) {
      toast.error(`Bid must be at least ${formatCurrency(listing.pricePerUnitMin, listing.currency)} (floor price)`);
      return;
    }

    if (bidQty > listing.quantity) {
      toast.error(`Only ${listing.quantity} ${listing.unit} available`);
      return;
    }

    setLoading(true);
    try {
      await api.post('/bids', {
        listingId: listing.id,
        bidPricePerUnit: bidPrice,
        quantity: bidQty,
        message: message || undefined,
      });

      toast.success('Bid placed successfully!');
      navigate('/buyer/bids');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to place bid');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-text mb-4">Place Your Bid</h2>

      {/* Price guide */}
      <div className="bg-surface-alt rounded-lg p-3 mb-4 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-text-secondary">Floor Price (min)</span>
          <span className="font-medium text-text">
            {formatCurrency(listing.pricePerUnitMin, listing.currency)}/{listing.unit}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Asking Price (ideal)</span>
          <span className="font-medium text-primary">
            {formatCurrency(listing.pricePerUnitMax, listing.currency)}/{listing.unit}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={`Your Bid Price (per ${listing.unit})`}
          type="number"
          placeholder={`Min ${listing.pricePerUnitMin}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />

        <Input
          label={`Quantity (${listing.unit})`}
          type="number"
          placeholder={`Max ${listing.quantity}`}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />

        {/* Live total */}
        {bidPrice > 0 && bidQty > 0 && (
          <div className="bg-primary/5 rounded-lg p-3 text-center">
            <p className="text-xs text-text-muted">Total Bid Amount</p>
            <p className="text-xl font-bold text-primary">
              {formatCurrency(totalAmount, listing.currency)}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Message to Farmer (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="e.g., We need delivery by next week..."
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Place Bid
        </Button>
      </form>
    </Card>
  );
}
