// =============================================================================
// ShipmentTracking — Track (and update) a shipment
// =============================================================================
// Loads the shipment for a transaction and renders its progress along the fixed
// status timeline (PENDING_PICKUP → ... → DELIVERED). The logistics provider /
// farmer can push status updates, attach a location/note, and assign driver
// details; the counterpart just watches the timeline.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Shipment, ShipmentStatus } from '../../types';

const STATUS_ORDER: ShipmentStatus[] = ['PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const STATUS_LABEL: Record<string, string> = {
  PENDING_PICKUP: 'PCK',
  PICKED_UP: 'GOT',
  IN_TRANSIT: 'TR',
  OUT_FOR_DELIVERY: 'OFD',
  DELIVERED: 'DLV',
  FAILED: 'FAIL',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cb-card">
      <div className="cb-eyebrow" style={{ marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, gap: 8 }}>
      <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{label}</span>
      <span style={{ color: 'var(--cb-ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function ShipmentTracking() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const { user } = useAuth();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [updateLocation, setUpdateLocation] = useState('');
  const [updateNote, setUpdateNote] = useState('');

  const [showDriverForm, setShowDriverForm] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

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
      toast.success('Status updated');
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
      setShipment((prev) => prev ? { ...prev, ...res.data } : null);
      setShowDriverForm(false);
      toast.success('Driver info updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update driver info');
    } finally {
      setUpdating(false);
    }
  }

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
        <div className="cb-page-eyebrow">Loading shipment…</div>
      </DashboardLayout>
    );
  }

  if (!shipment) {
    return (
      <DashboardLayout>
        <div className="cb-page-eyebrow">
          <Link to={`/transactions/${transactionId}`} style={{ color: 'inherit', textDecoration: 'none' }}>← Transaction</Link>
        </div>
        <div className="cb-card" style={{ marginTop: 20, textAlign: 'center', padding: 32 }}>
          <h3 className="cb-h3" style={{ fontSize: 20 }}>No shipment booked</h3>
          <p className="cb-small" style={{ marginTop: 8 }}>Book transport to start tracking your delivery.</p>
          <div style={{ marginTop: 18 }}>
            <Link to={`/logistics/book/${transactionId}`} className="cb-btn cb-btn-primary">
              Book transport
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const currentStepIndex = STATUS_ORDER.indexOf(shipment.status as ShipmentStatus);
  const failed = shipment.status === 'FAILED';

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to={`/transactions/${transactionId}`} style={{ color: 'inherit', textDecoration: 'none' }}>← Transaction</Link> · Shipment #{shipment.id.slice(-6).toUpperCase()}
      </div>

      <div className="cb-card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span className="cb-live-dot" />
          <span className="cb-mono" style={{ fontWeight: 500 }}>
            {failed ? '⚠ FAILED' : `● ${shipment.status.replace('_', ' ')}`}
          </span>
          {shipment.estimatedDeliveryDate && !failed && shipment.status !== 'DELIVERED' && (
            <span className="cb-tiny" style={{ marginLeft: 'auto' }}>
              ETA {new Date(shipment.estimatedDeliveryDate).toLocaleDateString()}
            </span>
          )}
        </div>
        <div style={{ fontWeight: 500, fontSize: 16 }}>
          {shipment.pickupLocation} → {shipment.deliveryLocation}
        </div>
        <div className="cb-tiny" style={{ marginTop: 4 }}>
          {shipment.distanceKm} km · {shipment.totalWeightKg?.toLocaleString()} kg
          {shipment.vehicleNumber && ` · ${shipment.vehicleNumber}`}
        </div>
      </div>

      <div className="cb-card" style={{ marginBottom: 16 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 18 }}>Route progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {STATUS_ORDER.map((status, i) => {
            const done = i < currentStepIndex && !failed;
            const current = i === currentStepIndex && !failed;
            const color = done ? 'var(--cb-forest)' : current ? 'var(--cb-ember)' : 'var(--cb-line)';
            return (
              <div key={status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && (
                  <div style={{ position: 'absolute', top: 6, left: '-50%', right: '50%', height: 1, background: (done || current) ? 'var(--cb-forest)' : 'var(--cb-line)' }} />
                )}
                <div style={{ width: 12, height: 12, borderRadius: 999, background: done ? 'var(--cb-forest)' : current ? 'var(--cb-ember)' : 'transparent', border: `1px solid ${color}`, position: 'relative', zIndex: 1 }} />
                <span className="cb-mono cb-tiny" style={{ marginTop: 6, color, fontSize: 9.5 }}>{STATUS_LABEL[status]}</span>
              </div>
            );
          })}
        </div>
        {failed && (
          <div className="cb-small" style={{ marginTop: 12, padding: 10, background: 'rgba(200,96,43,0.08)', color: 'var(--cb-ember)', borderRadius: 6 }}>
            ⚠ Shipment failed. Contact carrier.
          </div>
        )}

        {isFarmer && getNextStatuses().length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--cb-line)' }}>
            {!showUpdateForm ? (
              <Button size="sm" onClick={() => setShowUpdateForm(true)}>Update status</Button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="cb-cols-2" style={{ gap: 12 }}>
                  <div>
                    <label className="cb-label">Next status</label>
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="cb-input">
                      <option value="">Select…</option>
                      {getNextStatuses().map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <Input
                    label="Current location"
                    value={updateLocation}
                    onChange={(e) => setUpdateLocation(e.target.value)}
                    placeholder="e.g., Kasara toll"
                  />
                </div>
                <Input
                  label="Note (optional)"
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="Anything noteworthy"
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <Button size="sm" onClick={handleStatusUpdate} loading={updating} disabled={!newStatus || !updateLocation}>
                    Confirm update
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowUpdateForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cb-cols-2" style={{ gap: 16, marginBottom: 16 }}>
        <Section title="Driver">
          {shipment.driverName ? (
            <>
              <Row label="Name" value={shipment.driverName} />
              {shipment.driverPhone && <Row label="Phone" value={shipment.driverPhone} />}
              {shipment.vehicleNumber && <Row label="Vehicle" value={shipment.vehicleNumber} />}
            </>
          ) : (
            <div className="cb-tiny">No driver assigned yet.</div>
          )}
          {isFarmer && (
            <div style={{ marginTop: 12 }}>
              {!showDriverForm ? (
                <Button size="sm" variant="ghost" onClick={() => setShowDriverForm(true)}>
                  {shipment.driverName ? 'Update driver' : 'Add driver'}
                </Button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Input label="Driver name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                  <Input label="Phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
                  <Input label="Vehicle number" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Button size="sm" onClick={handleDriverUpdate} loading={updating}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowDriverForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="Carrier">
          {shipment.logisticsPartner && (
            <>
              <Row label="Name" value={shipment.logisticsPartner.name} />
              <Row label="Type" value={shipment.logisticsPartner.type.replace('_', ' ').toLowerCase()} />
              <Row label="Rating" value={`★ ${shipment.logisticsPartner.rating?.toFixed(1) || '—'}`} />
              {shipment.logisticsPartner.contactPhone && <Row label="Contact" value={shipment.logisticsPartner.contactPhone} />}
            </>
          )}
        </Section>
      </div>

      {shipment.trackingUpdates && Array.isArray(shipment.trackingUpdates) && shipment.trackingUpdates.length > 0 && (
        <div className="cb-card" style={{ padding: 0 }}>
          <div className="cb-eyebrow" style={{ padding: '16px 20px 0' }}>Event log</div>
          <div className="cb-table-wrap narrow">
            <table className="cb-table" style={{ marginTop: 8 }}>
              <tbody>
                {(shipment.trackingUpdates as any[]).slice().reverse().map((event, i) => (
                  <tr key={i}>
                    <td className="cb-mono" style={{ color: 'var(--cb-ink-3)', width: 120 }}>
                      {event.timestamp ? new Date(event.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td>{event.status?.replace('_', ' ') || event.note || 'Update'}</td>
                    <td className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>{event.location || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
