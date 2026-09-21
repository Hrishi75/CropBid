// =============================================================================
// AdminEnquiries — Inbound leads from both lead-gen marketplaces
// =============================================================================
// Enquiries never become a Transaction, so they appear on no other admin
// screen. This is the only place a lead is visible: who asked, for what, and
// which dealer or shop to pass it to. Status is editable inline so a lead can
// be worked off this page.
//
// TWO CATALOGUES, ONE PAGE. Machinery leads were the only ones shown here, so
// every seed, fertiliser and crop-protection enquiry /inputs produced was
// invisible to everybody but the farmer who raised it: nobody could follow
// one up, or tell whether that marketplace was working at all. The rows are
// different on purpose (a machine has an intent and a hire window, a seed
// lead has acres and a pack price), and the status machinery is shared.
//
// The catalogue lives in the URL (?kind=inputs), so a link can open straight
// onto the input leads.
// =============================================================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

type Kind = 'EQUIPMENT' | 'AGRI_INPUT';

interface Enquirer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
}

interface EquipmentLead {
  id: string;
  equipment: {
    id: string;
    title: string;
    category: string;
    dealer: { name: string; contactPhone: string | null; state: string } | null;
  } | null;
  user: Enquirer | null;
  intent: string;
  message: string | null;
  rentFrom: string | null;
  rentTo: string | null;
  status: string;
  createdAt: string;
}

interface InputLead {
  id: string;
  agriInput: {
    id: string;
    title: string;
    category: string;
    packSize: string;
    pricePerPack: number;
    subsidised: boolean;
    supplier: { name: string; contactPhone: string; location: string; state: string } | null;
  } | null;
  user: Enquirer | null;
  packQuantity: number | null;
  acres: number | null;
  message: string | null;
  status: string;
  createdAt: string;
}

const CATALOGUES: { kind: Kind; param: string; label: string }[] = [
  { kind: 'EQUIPMENT', param: 'equipment', label: 'Machinery' },
  { kind: 'AGRI_INPUT', param: 'inputs', label: 'Seeds & fertiliser' },
];

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  NEW: { label: 'NEW', color: 'var(--cb-ember)' },
  CONTACTED: { label: 'CTCD', color: 'var(--cb-wheat)' },
  CLOSED: { label: 'CLSD', color: 'var(--cb-sage)' },
};

// Where a lead can move next. CLOSED is terminal in the UI — reopening is
// rare enough that an accidental click shouldn't do it.
const NEXT_STATUS: Record<string, { to: string; label: string } | undefined> = {
  NEW: { to: 'CONTACTED', label: 'Mark contacted' },
  CONTACTED: { to: 'CLOSED', label: 'Close lead' },
};

const CATEGORY_LABEL: Record<string, string> = {
  SEED: 'Seed',
  FERTILISER: 'Fertiliser',
  CROP_PROTECTION: 'Crop protection',
  ORGANIC: 'Organic',
  MICRONUTRIENT: 'Micronutrient',
  SEEDLING: 'Seedling',
};

// Rupees as a price is written: whole where it is whole, and to the paisa
// where it is not, so ₹266.5 reads ₹266.50.
function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRentWindow(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const fmt = (d: string) => new Date(d).toLocaleDateString();
  if (from && to) return `${fmt(from)} → ${fmt(to)}`;
  return from ? `from ${fmt(from)}` : `until ${fmt(to!)}`;
}

// The two numbers somebody working a lead has to call.
function CallBoth({ enquirer, otherLabel, other }: { enquirer: Enquirer | null; otherLabel: string; other: string }) {
  return (
    <div
      className="cb-cols-2"
      style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--cb-line)', gap: 12 }}
    >
      <div>
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>ENQUIRER</div>
        <div className="cb-mono" style={{ fontSize: 13 }}>{enquirer?.phone || enquirer?.email || '—'}</div>
      </div>
      <div>
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 2 }}>{otherLabel}</div>
        <div className="cb-mono" style={{ fontSize: 13 }}>{other}</div>
      </div>
    </div>
  );
}

export function AdminEnquiries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kind: Kind = searchParams.get('kind') === 'inputs' ? 'AGRI_INPUT' : 'EQUIPMENT';

  const [enquiries, setEnquiries] = useState<Array<EquipmentLead | InputLead>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => {
    fetchEnquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, statusFilter, page]);

  async function fetchEnquiries() {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams();
      params.set('kind', kind);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const res = await api.get(`/admin/enquiries?${params}`);
      setEnquiries(res.data.enquiries);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to load enquiries:', err);
      // Said, rather than shown as an empty list: "no leads" is a claim, and a
      // failed fetch is not evidence for it.
      setFailed(true);
      setEnquiries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function switchCatalogue(next: Kind) {
    const param = CATALOGUES.find((c) => c.kind === next)!.param;
    setSearchParams(param === 'equipment' ? {} : { kind: param });
    setStatusFilter('');
    setPage(0);
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      // The kind travels with it: the two catalogues have separate id spaces.
      await api.patch(`/admin/enquiries/${id}`, { status, kind });
      toast.success(`Lead marked ${status.toLowerCase()}`);
      fetchEnquiries();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const newCount = enquiries.filter((e) => e.status === 'NEW').length;
  const isInputs = kind === 'AGRI_INPUT';
  const machineLeads = isInputs ? [] : (enquiries as EquipmentLead[]);
  const inputLeads = isInputs ? (enquiries as InputLead[]) : [];

  // The second and third numbers differ by catalogue: whether they want to buy
  // or hire a machine, and who is waiting on whom for inputs.
  //
  // NOT A SUM OF ACRES, which is what this first showed. One farmer asking
  // about the seed and the urea for the same six acres is two leads and six
  // acres, and adding them up reported twelve. Counting people is true.
  const kpis = isInputs
    ? [
        {
          label: 'Farmers',
          value: new Set(inputLeads.map((e) => e.user?.id).filter(Boolean)).size,
          delta: 'waiting on a call',
        },
        {
          label: 'Shops',
          value: new Set(inputLeads.map((e) => e.agriInput?.supplier?.name).filter(Boolean)).size,
          delta: 'with a farmer waiting',
        },
      ]
    : [
        { label: 'To buy', value: machineLeads.filter((e) => e.intent === 'SALE').length, delta: 'purchase intent' },
        { label: 'To hire', value: machineLeads.filter((e) => e.intent === 'RENT').length, delta: 'rental intent' },
      ];

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">
            {isInputs ? 'Input leads' : 'Equipment leads'} · {failed ? '—' : total.toLocaleString()} total
          </div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            {isInputs ? 'Input demand,' : 'Machinery demand,'}<br />
            <span className="cb-italic">as it lands.</span>
          </h1>
        </div>
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 16 }}>
        {CATALOGUES.map((c) => (
          <button
            key={c.kind}
            type="button"
            className={`cb-pill ${kind === c.kind ? 'active' : ''}`}
            onClick={() => switchCatalogue(c.kind)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Unworked</div>
          <div className="cb-kpi-value">{failed ? '—' : newCount}</div>
          <div className="cb-kpi-delta">on this page</div>
        </div>
        {kpis.map((k) => (
          <div className="cb-kpi-cell" key={k.label}>
            <div className="cb-kpi-label">{k.label}</div>
            <div className="cb-kpi-value">{failed ? '—' : k.value}</div>
            <div className="cb-kpi-delta">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="cb-pill-group" style={{ marginBottom: 20 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`cb-pill ${statusFilter === tab.value ? 'active' : ''}`}
            onClick={() => { setStatusFilter(tab.value); setPage(0); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : failed ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">These leads could not be loaded. Refresh to try again.</span>
        </div>
      ) : enquiries.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">{isInputs ? 'No input enquiries match.' : 'No equipment enquiries match.'}</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {enquiries.map((lead, i) => {
            const meta = STATUS_META[lead.status] || { label: lead.status.slice(0, 4), color: 'var(--cb-ink-3)' };
            const next = NEXT_STATUS[lead.status];
            const last = i === enquiries.length - 1;

            return (
              <div
                key={lead.id}
                style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}
              >
                {isInputs
                  ? <InputRow lead={lead as InputLead} meta={meta} />
                  : <MachineRow lead={lead as EquipmentLead} meta={meta} />}

                {next && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(lead.id, next.to)}
                      className="cb-btn cb-btn-link"
                      style={{ fontSize: 12 }}
                    >
                      {next.label} →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }} className="cb-mono cb-tiny">
          <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>← prev</button>
          <span>page {page + 1} of {totalPages}</span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="cb-btn cb-btn-link" style={{ fontSize: 12 }}>next →</button>
        </div>
      )}
    </DashboardLayout>
  );
}

function MachineRow({ lead, meta }: { lead: EquipmentLead; meta: { label: string; color: string } }) {
  const rentWindow = formatRentWindow(lead.rentFrom, lead.rentTo);
  const dealer = lead.equipment?.dealer;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
            #E-{lead.id.slice(-6).toUpperCase()}
          </span>
          <span style={{ fontWeight: 500 }}>{lead.equipment?.title || 'Equipment'}</span>
        </div>
        <span className="cb-mono cb-tiny" style={{ color: meta.color }}>
          ● {meta.label} · {lead.intent === 'RENT' ? 'HIRE' : 'BUY'}
        </span>
      </div>

      <div className="cb-small" style={{ marginBottom: 8 }}>
        {lead.user?.name || 'Unknown'}
        {lead.user?.location ? ` · ${lead.user.location}` : ''} · {new Date(lead.createdAt).toLocaleDateString()}
      </div>

      {lead.message && (
        <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)' }}>“{lead.message}”</div>
      )}

      {rentWindow && (
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 8 }}>wants it {rentWindow}</div>
      )}

      {/* Both phone numbers — working a lead means calling the farmer and
          the dealer who holds the machine. */}
      <CallBoth
        enquirer={lead.user}
        otherLabel="DEALER"
        other={dealer ? `${dealer.name}${dealer.contactPhone ? ` · ${dealer.contactPhone}` : ''}` : '—'}
      />
    </>
  );
}

function InputRow({ lead, meta }: { lead: InputLead; meta: { label: string; color: string } }) {
  const product = lead.agriInput;
  const shop = product?.supplier;
  // What sizes the order for the shop before it calls back: how much land,
  // and how many packs, when the farmer said.
  const size = [
    lead.acres ? `${lead.acres} acres` : null,
    lead.packQuantity ? `${lead.packQuantity} × ${product?.packSize ?? 'pack'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
            #I-{lead.id.slice(-6).toUpperCase()}
          </span>
          <span style={{ fontWeight: 500 }}>{product?.title || 'Product'}</span>
        </div>
        <span className="cb-mono cb-tiny" style={{ color: meta.color }}>
          ● {meta.label} · {(CATEGORY_LABEL[product?.category ?? ''] ?? product?.category ?? '').toUpperCase()}
        </span>
      </div>

      <div className="cb-small" style={{ marginBottom: 8 }}>
        {lead.user?.name || 'Unknown'}
        {lead.user?.location ? ` · ${lead.user.location}` : ''} · {new Date(lead.createdAt).toLocaleDateString()}
      </div>

      {(size || product) && (
        <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginBottom: 8 }}>
          {size ? `${size} · ` : ''}
          {product ? `${rupees(product.pricePerPack)} per ${product.packSize}` : ''}
          {/* A statutory price, identical at every licensed shop: worth knowing
              before a call in which a shop quotes anything else. */}
          {product?.subsidised ? ' · MRP fixed by government' : ''}
        </div>
      )}

      {lead.message && (
        <div className="cb-small" style={{ marginBottom: 8, color: 'var(--cb-ink-2)' }}>“{lead.message}”</div>
      )}

      <CallBoth
        enquirer={lead.user}
        otherLabel="SHOP"
        other={shop ? `${shop.name} · ${shop.location} · ${shop.contactPhone}` : '—'}
      />
    </>
  );
}
