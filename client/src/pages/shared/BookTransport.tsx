// =============================================================================
// Book Transport — Select logistics partner and book shipment for a transaction
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Truck, MapPin, Weight, Calendar,
  Star, Clock, DollarSign, CheckCircle, AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { LogisticsPartner, TransportQuote } from '../../types';

interface TransactionInfo {
  cropName: string;
  quantity: number;
  unit: string;
  weightKg: number;
  isPerishable: boolean;
  origin: string;
  country: string;
}

export function BookTransport() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

  const [partners, setPartners] = useState<LogisticsPartner[]>([]);
  const [txInfo, setTxInfo] = useState<TransactionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Booking form
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [quote, setQuote] = useState<TransportQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [pickupLocation, setPickupLocation] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [paidBy, setPaidBy] = useState<'BUYER' | 'FARMER' | 'SPLIT'>('BUYER');
  const [splitPercent, setSplitPercent] = useState(50);
  const [booking, setBooking] = useState(false);

  // Fetch matching partners
  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get(`/logistics/partners/${transactionId}`);
        setPartners(res.data.partners);
        setTxInfo(res.data.transactionInfo);
        if (res.data.transactionInfo) {
          setPickupLocation(res.data.transactionInfo.origin);
        }
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to load partners');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [transactionId]);

  // Fetch quote when partner + distance changes
  async function fetchQuote(partnerId: string) {
    if (!distanceKm || !txInfo) return;
    setQuoteLoading(true);
    try {
      const res = await api.post('/logistics/quote', {
        partnerId,
        distanceKm: Number(distanceKm),
        weightKg: txInfo.weightKg,
      });
      setQuote(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to get quote');
    } finally {
      setQuoteLoading(false);
    }
  }

  function handleSelectPartner(partnerId: string) {
    setSelectedPartner(partnerId);
    const partner = partners.find(p => p.id === partnerId);
    if (partner && partner.vehicleTypes.length > 0) {
      setVehicleType(partner.vehicleTypes[0]);
    }
    if (distanceKm) {
      fetchQuote(partnerId);
    }
  }

  async function handleBook() {
    if (!selectedPartner || !pickupLocation || !deliveryLocation || !pickupDate || !distanceKm || !vehicleType) {
      toast.error('Please fill all fields');
      return;
    }

    setBooking(true);
    try {
      await api.post('/logistics/book', {
        transactionId,
        logisticsPartnerId: selectedPartner,
        pickupLocation,
        deliveryLocation,
        pickupDate,
        distanceKm: Number(distanceKm),
        totalWeightKg: txInfo?.weightKg,
        vehicleType,
        paidBy,
        splitPercentBuyer: paidBy === 'SPLIT' ? splitPercent : undefined,
      });
      toast.success('Shipment booked successfully!');
      navigate(`/logistics/shipment/transaction/${transactionId}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Booking failed');
    } finally {
      setBooking(false);
    }
  }

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
        <Link to={`/transactions/${transactionId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Transaction
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Truck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">Book Transport</h1>
            {txInfo && (
              <p className="text-sm text-text-muted">
                {txInfo.cropName} — {txInfo.quantity} {txInfo.unit} ({txInfo.weightKg} kg)
                {txInfo.isPerishable && (
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                    Perishable
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Shipment details form */}
        <Card className="mb-6">
          <h3 className="font-semibold text-text-primary mb-4">Shipment Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Pickup Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={e => setPickupLocation(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-surface focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Pune, Maharashtra"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Delivery Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={deliveryLocation}
                  onChange={e => setDeliveryLocation(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-surface focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Mumbai, Maharashtra"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Pickup Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                <input
                  type="date"
                  value={pickupDate}
                  onChange={e => setPickupDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-surface focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Distance (km)</label>
              <div className="relative">
                <Weight className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
                <input
                  type="number"
                  value={distanceKm}
                  onChange={e => {
                    setDistanceKm(e.target.value);
                    if (selectedPartner && e.target.value) {
                      fetchQuote(selectedPartner);
                    }
                  }}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-surface focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., 150"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Logistics Partners */}
        <Card className="mb-6">
          <h3 className="font-semibold text-text-primary mb-4">
            Available Partners ({partners.length})
          </h3>
          {partners.length === 0 ? (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 text-text-muted mx-auto mb-2" />
              <p className="text-text-muted">No partners available for this route and weight.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {partners.map(partner => (
                <div
                  key={partner.id}
                  onClick={() => handleSelectPartner(partner.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedPartner === partner.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-text-primary">{partner.name}</h4>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-alt text-text-muted">
                          {partner.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-text-muted">
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500" />
                          {partner.rating}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ~{partner.avgDeliveryDays} days
                        </span>
                        <span>
                          {partner.minQuantityKg}–{partner.maxQuantityKg} kg
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {partner.vehicleTypes.map(v => (
                          <span key={v} className="text-xs bg-surface-alt px-2 py-0.5 rounded">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                    {selectedPartner === partner.id && (
                      <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Vehicle type selection */}
        {selectedPartner && (
          <Card className="mb-6">
            <h3 className="font-semibold text-text-primary mb-4">Vehicle & Payment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Vehicle Type</label>
                <select
                  value={vehicleType}
                  onChange={e => setVehicleType(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:ring-2 focus:ring-primary"
                >
                  {partners.find(p => p.id === selectedPartner)?.vehicleTypes.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Paid By</label>
                <select
                  value={paidBy}
                  onChange={e => setPaidBy(e.target.value as any)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:ring-2 focus:ring-primary"
                >
                  <option value="BUYER">Buyer pays</option>
                  <option value="FARMER">Farmer pays</option>
                  <option value="SPLIT">Split cost</option>
                </select>
              </div>
              {paidBy === 'SPLIT' && (
                <div className="md:col-span-2">
                  <label className="block text-sm text-text-muted mb-1">
                    Buyer pays {splitPercent}% — Farmer pays {100 - splitPercent}%
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={splitPercent}
                    onChange={e => setSplitPercent(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Quote summary */}
        {quote && (
          <Card className="mb-6 bg-primary/5 border-primary/20">
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Cost Estimate
            </h3>
            {quoteLoading ? (
              <div className="animate-pulse h-20 bg-surface-alt rounded" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Transport cost</span>
                  <span className="font-medium">₹{quote.transportCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Platform fee</span>
                  <span className="text-text-muted">₹{quote.platformCommission.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold text-base">
                  <span>Total</span>
                  <span className="text-primary">₹{quote.totalCost.toLocaleString('en-IN')}</span>
                </div>
                <p className="text-xs text-text-muted">
                  Estimated delivery: ~{quote.estimatedDays} days
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Book button */}
        <div className="flex justify-end">
          <Button
            onClick={handleBook}
            loading={booking}
            disabled={!selectedPartner || !pickupLocation || !deliveryLocation || !pickupDate || !distanceKm}
            size="lg"
          >
            <Truck className="w-4 h-4 mr-2" />
            Book Shipment
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
