// =============================================================================
// BookTransport — Arrange shipping for a closed deal (OPS)
// =============================================================================
// Admin-only, reached at /admin/logistics/book/:transactionId. CropBid books
// the carrier because CropBid inspects the goods on the way through, so this is
// an ops console, not something the two sides of the deal ever see. The three
// endpoints it drives (/logistics/partners/:id, /quote, /book) are all
// requireRole('ADMIN').
//
// Loads available logistics partners and the cargo info (weight, perishable,
// origin), lets ops pick a partner, fetch a price quote, set pickup/delivery
// details, then books the shipment.
//
// There is no "who pays" control. The seller carries the freight cost on every
// deal, so the server writes paidBy: FARMER itself and the request schema has
// no field for it. Restoring a picker here means changing the rule, not just
// this form.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { formatCurrency } from '../../utils/currency';
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 0', borderBottom: '1px solid var(--cb-line)' }}>
      <div className="cb-eyebrow">{title}</div>
      {children}
    </div>
  );
}

export function BookTransport() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

  const [partners, setPartners] = useState<LogisticsPartner[]>([]);
  const [txInfo, setTxInfo] = useState<TransactionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [quote, setQuote] = useState<TransportQuote | null>(null);

  const [pickupLocation, setPickupLocation] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [booking, setBooking] = useState(false);

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

  async function fetchQuote(partnerId: string) {
    if (!distanceKm || !txInfo) return;
    try {
      const res = await api.post('/logistics/quote', {
        partnerId,
        distanceKm: Number(distanceKm),
        weightKg: txInfo.weightKg,
      });
      setQuote(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to get quote');
    }
  }

  function selectPartner(partnerId: string) {
    setSelectedPartner(partnerId);
    const partner = partners.find((p) => p.id === partnerId);
    if (partner && partner.vehicleTypes.length > 0) {
      setVehicleType(partner.vehicleTypes[0]);
    }
    if (distanceKm) fetchQuote(partnerId);
  }

  async function handleBook() {
    if (!selectedPartner || !pickupLocation || !deliveryLocation || !pickupDate || !distanceKm || !vehicleType) {
      toast.error('Fill all fields');
      return;
    }
    setBooking(true);
    try {
      await api.post('/logistics/book', {
        transactionId,
        logisticsPartnerId: selectedPartner,
        pickupLocation,
        deliveryLocation,
        pickupDate: new Date(pickupDate).toISOString(),
        distanceKm: Number(distanceKm),
        totalWeightKg: txInfo?.weightKg,
        vehicleType,
      });
      toast.success('Shipment booked');
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
        <div className="cb-page-eyebrow">Loading carriers…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to={`/transactions/${transactionId}`} style={{ color: 'inherit', textDecoration: 'none' }}>← Transaction</Link> · #{transactionId?.slice(-6).toUpperCase()} / Book transport
      </div>

      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Move {txInfo ? `${txInfo.quantity} ${txInfo.unit.toLowerCase()} ${txInfo.cropName.toLowerCase()}` : 'your lot'},<br />
        <span className="cb-italic">to destination.</span>
      </h1>

      {txInfo && (
        <div className="cb-card" style={{ marginTop: 24, marginBottom: 18 }}>
          <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Shipment</div>
          <div style={{ fontWeight: 500 }}>
            {txInfo.cropName} · {txInfo.quantity} {txInfo.unit.toLowerCase()} · {txInfo.weightKg.toLocaleString()} kg
            {txInfo.isPerishable && <span className="cb-chip cb-chip-ember" style={{ marginLeft: 8 }}>perishable</span>}
          </div>
          <div className="cb-tiny" style={{ marginTop: 4 }}>Origin: {txInfo.origin}, {txInfo.country}</div>
        </div>
      )}

      <div className="cb-card" style={{ marginBottom: 18 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 14 }}>Carrier · select one</div>
        {partners.length === 0 ? (
          <div className="cb-tiny" style={{ textAlign: 'center', padding: 20 }}>
            ⚠ No partners available for this route and weight.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {partners.map((partner) => {
              const isSelected = selectedPartner === partner.id;
              return (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => selectPartner(partner.id)}
                  style={{
                    background: isSelected ? 'rgba(31,45,24,0.04)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--cb-forest)' : 'var(--cb-line)'}`,
                    borderRadius: 10, padding: 14, textAlign: 'left',
                    cursor: 'pointer', color: 'inherit', font: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isSelected && <span className="cb-dot cb-dot-ember" />}
                      <span style={{ fontWeight: 500 }}>{partner.name}</span>
                      <span className="cb-chip">{partner.type.replace('_', ' ').toLowerCase()}</span>
                    </div>
                    <span className="cb-mono cb-tiny">★ {partner.rating?.toFixed(1) || '—'}</span>
                  </div>
                  <div className="cb-tiny" style={{ marginBottom: 6 }}>
                    ETA {partner.avgDeliveryDays}d · {partner.minQuantityKg}–{partner.maxQuantityKg} kg · {partner.commissionPercent}% commission
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {partner.vehicleTypes.map((v) => (
                      <span key={v} className="cb-chip" style={{ fontSize: 10 }}>{v}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedPartner && (
        <div className="cb-card">
          <div style={{ padding: '4px 0' }}>
            <Section title="Route">
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input label="Pickup" placeholder="e.g., Pune APMC" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} />
                <Input label="Drop" placeholder="e.g., Mumbai dock 4" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} />
              </div>
              <div className="cb-cols-2" style={{ gap: 14 }}>
                <Input
                  label="Distance (km)"
                  type="number"
                  placeholder="e.g., 165"
                  value={distanceKm}
                  onChange={(e) => {
                    setDistanceKm(e.target.value);
                    if (selectedPartner && e.target.value) fetchQuote(selectedPartner);
                  }}
                />
                <Input label="Pickup date" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
              </div>
            </Section>

            <Section title="Vehicle">
              <div>
                <label className="cb-label">Type</label>
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="cb-input">
                  {partners.find((p) => p.id === selectedPartner)?.vehicleTypes.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </Section>

            {/* Was a Buyer/Farmer/Split picker. The seller pays the freight on
                every deal now, so this states the rule instead of offering a
                choice the server would ignore. */}
            <Section title="Cost">
              <p className="cb-small" style={{ margin: 0 }}>
                Billed to the seller and deducted from their settlement.
              </p>
            </Section>

            {quote && (
              <Section title="Quote breakdown">
                <div className="cb-card" style={{ padding: 14, background: 'var(--cb-paper-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }} className="cb-mono">
                    <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TRANSPORT</span>
                    <span>{formatCurrency(quote.transportCost, 'INR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }} className="cb-mono">
                    <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>COMMISSION</span>
                    <span>{formatCurrency(quote.platformCommission, 'INR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--cb-line)', fontWeight: 600 }} className="cb-mono">
                    <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>TOTAL</span>
                    <span style={{ fontSize: 16 }}>{formatCurrency(quote.totalCost, 'INR')}</span>
                  </div>
                  <div className="cb-tiny" style={{ marginTop: 6 }}>ETA {quote.estimatedDays} days</div>
                </div>
              </Section>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '18px 0' }}>
              <Button onClick={handleBook} loading={booking} size="lg">
                Confirm & book
                <ArrowIcon />
              </Button>
              <Button variant="ghost" size="lg" onClick={() => navigate(-1)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
