// =============================================================================
// Shipment Tracking — Live tracking view for a shipment
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Truck, Package, MapPin, CheckCircle, XCircle,
  Phone, User, Clock, Camera, AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Shipment, ShipmentStatus } from '../../types';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Truck; color: string }> = {
  PENDING_PICKUP: { label: 'Pending Pickup', icon: Package, color: 'text-yellow-600' },
  PICKED_UP: { label: 'Picked Up', icon: Package, color: 'text-blue-600' },
  IN_TRANSIT: { label: 'In Transit', icon: Truck, color: 'text-blue-600' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', icon: MapPin, color: 'text-purple-600' },
  DELIVERED: { label: 'Delivered', icon: CheckCircle, color: 'text-green-600' },
  FAILED: { label: 'Failed', icon: XCircle, color: 'text-red-600' },
};

const STATUS_ORDER: ShipmentStatus[] = [
  'PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
];

export function ShipmentTracking() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const { user } = useAuth();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Status update form
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [updateLocation, setUpdateLocation] = useState('');
  const [updateNote, setUpdateNote] = useState('');

  // Driver info form
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

  // Proof of delivery
  const [proofUrl, setProofUrl] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        const res = await api.get(`/logistics/transaction/${transactionId}`);
        const data = res.data.shipment !== undefined ? res.data : res.data;
        setShipment(data.shipment || data);
      } catch (err: any) {
        console.error('Failed to load shipment:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [transactionId]);

  const isFarmer = user?.id === shipment?.transaction?.farmerId;

  async function handleStatusUpdate() {
    if (!shipment || !newStatus || !updateLocation) return;
    setUpdating(true);
    try {
      const res = await api.put(`/logistics/shipment/${shipment.id}/status`, {
        status: newStatus,
        location: updateLocation,
        note: updateNote || `Status updated to ${newStatus}`,
      });
      setShipment(res.data);
      setShowUpdateForm(false);
      setNewStatus('');
      setUpdateLocation('');
      setUpdateNote('');
      toast.success('Shipment status updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  async function handleDriverUpdate() {
    if (!shipment) return;
    setUpdating(true);
    try {
      const res = await api.put(`/logistics/shipment/${shipment.id}/driver`, {
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        vehicleNumber: vehicleNumber || undefined,
      });
      setShipment(prev => prev ? { ...prev, ...res.data } : null);
      setShowDriverForm(false);
      toast.success('Driver info updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update driver info');
    } finally {
      setUpdating(false);
    }
  }

  async function handleProofUpload() {
    if (!shipment || !proofUrl) return;
    setUpdating(true);
    try {
      await api.put(`/logistics/shipment/${shipment.id}/proof`, { imageUrl: proofUrl });
      setShipment(prev => prev ? { ...prev, proofOfDelivery: proofUrl } : null);
      toast.success('Proof of delivery uploaded');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload proof');
    } finally {
      setUpdating(false);
    }
  }

  // Get valid next statuses for the current status
  function getNextStatuses(): string[] {
    if (!shipment) return [];
    const transitions: Record<string, string[]> = {
      PENDING_PICKUP: ['PICKED_UP', 'FAILED'],
      PICKED_UP: ['IN_TRANSIT', 'FAILED'],
      IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED'],
      OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
    };
    return transitions[shipment.status] || [];
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

  if (!shipment) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto">
          <Link to={`/transactions/${transactionId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Transaction
          </Link>
          <Card>
            <div className="text-center py-8">
              <Truck className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted mb-4">No shipment booked yet for this transaction.</p>
              <Link to={`/logistics/book/${transactionId}`}>
                <Button>Book Transport</Button>
              </Link>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const currentStepIndex = STATUS_ORDER.indexOf(shipment.status as ShipmentStatus);
  const statusCfg = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.PENDING_PICKUP;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Link to={`/transactions/${transactionId}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Transaction
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Truck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">Shipment Tracking</h1>
            <p className="text-sm text-text-muted">
              {shipment.pickupLocation} → {shipment.deliveryLocation}
            </p>
          </div>
        </div>

        {/* Status Progress */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-6">
            {STATUS_ORDER.map((status, idx) => {
              const cfg = STATUS_CONFIG[status];
              const StepIcon = cfg.icon;
              const isCompleted = idx <= currentStepIndex && shipment.status !== 'FAILED';
              const isCurrent = status === shipment.status;

              return (
                <div key={status} className="flex-1 flex flex-col items-center relative">
                  {idx > 0 && (
                    <div
                      className={`absolute top-4 -left-1/2 w-full h-0.5 ${
                        isCompleted ? 'bg-accent' : 'bg-border'
                      }`}
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-colors
                      ${isCompleted ? 'bg-accent text-white' : 'bg-surface-alt text-text-muted border border-border'}
                      ${isCurrent ? 'ring-2 ring-accent ring-offset-2' : ''}`}
                  >
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <p className={`text-xs mt-2 text-center ${isCompleted ? 'text-accent font-medium' : 'text-text-muted'}`}>
                    {cfg.label}
                  </p>
                </div>
              );
            })}
          </div>

          {shipment.status === 'FAILED' && (
            <div className="p-3 bg-red-50 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4" />
              Shipment has failed. Contact the logistics partner.
            </div>
          )}

          {/* Current status badge */}
          <div className="flex items-center justify-center gap-2 py-2">
            <span className={`text-sm font-semibold ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {shipment.estimatedDeliveryDate && shipment.status !== 'DELIVERED' && shipment.status !== 'FAILED' && (
              <span className="text-xs text-text-muted ml-2">
                ETA: {new Date(shipment.estimatedDeliveryDate).toLocaleDateString('en-IN')}
              </span>
            )}
          </div>

          {/* Update status button (for farmer) */}
          {isFarmer && getNextStatuses().length > 0 && (
            <div className="mt-4 flex justify-center">
              {!showUpdateForm ? (
                <Button size="sm" onClick={() => setShowUpdateForm(true)}>
                  Update Status
                </Button>
              ) : (
                <div className="w-full space-y-3 border-t border-border pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="px-3 py-2 border border-border rounded-lg text-sm bg-surface"
                    >
                      <option value="">Select status</option>
                      {getNextStatuses().map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={updateLocation}
                      onChange={e => setUpdateLocation(e.target.value)}
                      placeholder="Current location"
                      className="px-3 py-2 border border-border rounded-lg text-sm bg-surface"
                    />
                  </div>
                  <input
                    type="text"
                    value={updateNote}
                    onChange={e => setUpdateNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleStatusUpdate} loading={updating} disabled={!newStatus || !updateLocation}>
                      Confirm Update
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowUpdateForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Shipment info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Logistics partner */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Logistics Partner
            </h3>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{shipment.logisticsPartner?.name}</p>
              <p className="text-text-muted">{shipment.logisticsPartner?.type.replace('_', ' ')}</p>
              <p className="text-text-muted">{shipment.vehicleType}</p>
              <p className="text-text-muted">{shipment.distanceKm} km · {shipment.totalWeightKg} kg</p>
            </div>
          </Card>

          {/* Driver info */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Driver Info
            </h3>
            {shipment.driverName ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">{shipment.driverName}</p>
                {shipment.driverPhone && (
                  <p className="flex items-center gap-1 text-text-muted">
                    <Phone className="w-3 h-3" /> {shipment.driverPhone}
                  </p>
                )}
                {shipment.vehicleNumber && (
                  <p className="text-text-muted">Vehicle: {shipment.vehicleNumber}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No driver assigned yet.</p>
            )}
            {isFarmer && (
              <div className="mt-3">
                {!showDriverForm ? (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setDriverName(shipment.driverName || '');
                    setDriverPhone(shipment.driverPhone || '');
                    setVehicleNumber(shipment.vehicleNumber || '');
                    setShowDriverForm(true);
                  }}>
                    {shipment.driverName ? 'Edit' : 'Add Driver Info'}
                  </Button>
                ) : (
                  <div className="space-y-2 mt-2">
                    <input type="text" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-surface" />
                    <input type="text" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="Phone number" className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-surface" />
                    <input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="Vehicle number" className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-surface" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleDriverUpdate} loading={updating}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowDriverForm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Cost breakdown */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Cost & Schedule
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Transport</span>
                <span>₹{shipment.transportCost.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Platform fee</span>
                <span>₹{shipment.platformCommission.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border pt-2">
                <span>Total</span>
                <span className="text-primary">₹{(shipment.transportCost + shipment.platformCommission).toLocaleString('en-IN')}</span>
              </div>
              <div className="text-xs text-text-muted mt-2">
                Paid by: {shipment.paidBy}
                {shipment.paidBy === 'SPLIT' && ` (Buyer ${shipment.splitPercentBuyer}% / Farmer ${100 - (shipment.splitPercentBuyer || 50)}%)`}
              </div>
              <div className="text-xs text-text-muted">
                Pickup: {new Date(shipment.pickupDate).toLocaleDateString('en-IN')}
              </div>
              {shipment.actualDeliveryDate && (
                <div className="text-xs text-text-muted">
                  Delivered: {new Date(shipment.actualDeliveryDate).toLocaleDateString('en-IN')}
                </div>
              )}
            </div>
          </Card>

          {/* Proof of delivery */}
          <Card>
            <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Proof of Delivery
            </h3>
            {shipment.proofOfDelivery ? (
              <div>
                <img
                  src={shipment.proofOfDelivery}
                  alt="Proof of delivery"
                  className="w-full rounded-lg object-cover max-h-48"
                />
              </div>
            ) : shipment.status === 'DELIVERED' && isFarmer ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={proofUrl}
                  onChange={e => setProofUrl(e.target.value)}
                  placeholder="Paste image URL"
                  className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-surface"
                />
                <Button size="sm" onClick={handleProofUpload} loading={updating} disabled={!proofUrl}>
                  Upload Proof
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {shipment.status === 'DELIVERED' ? 'Waiting for proof upload.' : 'Available after delivery.'}
              </p>
            )}
          </Card>
        </div>

        {/* Tracking Timeline */}
        <Card>
          <h3 className="font-semibold text-text-primary mb-4">Tracking History</h3>
          <div className="space-y-0">
            {(shipment.trackingUpdates || []).slice().reverse().map((update, idx) => (
              <div key={idx} className="flex gap-3 pb-4 relative">
                {/* Timeline line */}
                {idx < shipment.trackingUpdates.length - 1 && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border" />
                )}
                {/* Dot */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  idx === 0 ? 'bg-primary text-white' : 'bg-surface-alt border border-border'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-white' : 'bg-text-muted'}`} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {STATUS_CONFIG[update.status]?.label || update.status}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(update.timestamp).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted">{update.location}</p>
                  {update.note && (
                    <p className="text-xs text-text-muted mt-0.5">{update.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
