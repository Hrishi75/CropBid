// =============================================================================
// AdminEquipment — the machinery catalogue, as ops see it and run it
// =============================================================================
// /equipment reached the database through prisma/seedEquipment.ts alone, so
// adding a dealer or a machine meant editing a file and waiting for a deploy.
// This is the same screen seeds and fertiliser got in #150, minus the licence
// gate: hiring out a rotavator is not a licensed trade the way selling
// certified seed is, so nothing here is hidden from farmers by rule. A row is
// live unless somebody took it, or its dealer, off the catalogue.
//
// Live comes from the server running the same rule /equipment runs, so this
// page cannot disagree with what a farmer sees. It never receives a dealer's
// phone number, including right after saving one.
// =============================================================================

import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import { ConfirmButton } from './ConfirmButton';
import { ClaimsForm } from './equipment/ClaimsForm';
import { DealerForm } from './equipment/DealerForm';
import { MachineForm } from './equipment/MachineForm';
import {
  apiMessage,
  priceLine,
  type AdminDealer,
  type AdminMachine,
  type CategoryCount,
} from './equipment/types';

interface CatalogueResponse {
  equipment: AdminMachine[];
  total: number;
  counts: { total: number; live: number };
  categories: CategoryCount[];
}

type View = 'machines' | 'dealers';
type Visibility = '' | 'live' | 'hidden';

// At most one form open at a time, so a half-typed machine is never hidden
// behind another form the admin opened and forgot.
type Open =
  | { kind: 'add-machine' }
  | { kind: 'edit-machine'; id: string }
  | { kind: 'add-dealer' }
  | { kind: 'edit-dealer'; id: string }
  | { kind: 'claims'; id: string }
  | null;

const VISIBILITY_TABS: { value: Visibility; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'live', label: 'Live on /equipment' },
  { value: 'hidden', label: 'Taken off' },
];

const MODE_LABEL: Record<string, string> = { SALE: 'sale', RENT: 'hire', BOTH: 'sale or hire' };

export function AdminEquipment() {
  const [view, setView] = useState<View>('machines');
  const [open, setOpen] = useState<Open>(null);

  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const LIMIT = 20;

  const [dealers, setDealers] = useState<AdminDealer[] | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [dealersFailed, setDealersFailed] = useState(false);
  const [dealersReload, setDealersReload] = useState(0);

  // Loading and failure are worked out from which request last settled, so a
  // new filter reads as loading the moment it is clicked, and the last good
  // page stays on screen (dimmed) until the new one lands.
  const requestKey = [category, visibility, query, page, reload].join('|');
  const catalogueLoading = settledKey !== requestKey;
  const catalogueFailed = failedKey === requestKey;

  useEffect(() => {
    // A filter clicked twice quickly can have its first answer land second;
    // only the latest request is allowed to write.
    let current = true;

    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (visibility) params.set('visibility', visibility);
    if (query) params.set('q', query);
    params.set('limit', String(LIMIT));
    params.set('offset', String(page * LIMIT));

    api.get<CatalogueResponse>(`/admin/equipment?${params}`)
      .then((res) => {
        if (!current) return;
        // A write can leave this page past the end: take off the last machine
        // on page 3 and there is no page 3. Step back rather than showing
        // "No machines match" with the pager gone.
        const lastPage = Math.max(0, Math.ceil(res.data.total / LIMIT) - 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setCatalogue(res.data);
        setSettledKey(requestKey);
      })
      .catch((err) => {
        console.error('Failed to load the equipment catalogue:', err);
        if (!current) return;
        setFailedKey(requestKey);
        setSettledKey(requestKey);
      });

    return () => { current = false; };
  }, [category, visibility, query, page, requestKey]);

  useEffect(() => {
    let current = true;
    api.get<{ dealers: AdminDealer[]; states: string[] }>('/admin/equipment/dealers')
      .then((res) => {
        if (!current) return;
        setDealers(res.data.dealers);
        setStates(res.data.states);
        setDealersFailed(false);
      })
      .catch((err) => {
        console.error('Failed to load equipment dealers:', err);
        if (current) setDealersFailed(true);
      });
    return () => { current = false; };
  }, [dealersReload]);

  // Any write can move a count on either tab (a dealer taken off changes what
  // is live), so both are fetched again.
  function refresh() {
    setReload((n) => n + 1);
    setDealersReload((n) => n + 1);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
    setPage(0);
  }

  function onMachineSaved(m: AdminMachine, added: boolean) {
    setOpen(null);
    refresh();
    if (m.live) toast.success(`${m.title} ${added ? 'added, and live on /equipment' : 'saved'}`);
    else toast.success(`${m.title} saved. Not on /equipment: ${m.hiddenBecause[0]?.toLowerCase()}`);
  }

  async function setMachineActive(m: AdminMachine, active: boolean) {
    try {
      await api.patch(`/admin/equipment/${m.id}`, { active });
      toast.success(active ? `${m.title} is back on the catalogue` : `${m.title} taken off /equipment`);
      refresh();
    } catch (err) {
      toast.error(apiMessage(err, 'Could not update the machine'));
    }
  }

  async function setDealerActive(d: AdminDealer, active: boolean) {
    try {
      await api.patch(`/admin/equipment/dealers/${d.id}`, { active });
      toast.success(active ? `${d.name} is back on the catalogue` : `${d.name} taken off /equipment`);
      refresh();
    } catch (err) {
      toast.error(apiMessage(err, 'Could not update the dealer'));
    }
  }

  function onDealerSaved(d: AdminDealer, message: string) {
    setOpen(null);
    refresh();
    toast.success(message.replace('{name}', d.name));
  }

  const counts = catalogue?.counts;
  const categories = catalogue?.categories ?? [];
  const unverified = dealers?.filter((d) => !d.verified).length;
  const totalPages = catalogue ? Math.ceil(catalogue.total / LIMIT) : 0;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">
            Machinery · {counts ? `${counts.total.toLocaleString()} machines` : '…'}
          </div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            The machinery yard,<br />
            <span className="cb-italic">dealers and all.</span>
          </h1>
        </div>
      </div>

      <p className="cb-small" style={{ maxWidth: 680, marginTop: 0, marginBottom: 20, color: 'var(--cb-ink-2)' }}>
        Everything here shows on <span className="cb-mono">/equipment</span> as soon as it is added:
        selling or hiring machinery needs no licence, so there is nothing to wait on. A machine is
        listed where its dealer is, and a dealer taken off takes their whole yard with them.
      </p>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Live on /equipment</div>
          <div className="cb-kpi-value">{counts ? counts.live : '—'}</div>
          <div className="cb-kpi-delta">what a farmer can see</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Taken off</div>
          <div className="cb-kpi-value">{counts ? counts.total - counts.live : '—'}</div>
          <div className="cb-kpi-delta">saved, not shown</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Dealers</div>
          <div className="cb-kpi-value">{dealers ? dealers.length : '—'}</div>
          <div className="cb-kpi-delta">
            {unverified === undefined ? 'machinery partners' : `${unverified} not verified yet`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="cb-pill-group">
          <button type="button" className={`cb-pill ${view === 'machines' ? 'active' : ''}`} onClick={() => { setView('machines'); setOpen(null); }}>
            Machines
          </button>
          <button type="button" className={`cb-pill ${view === 'dealers' ? 'active' : ''}`} onClick={() => { setView('dealers'); setOpen(null); }}>
            Dealers
          </button>
        </div>
        {view === 'machines' ? (
          <button type="button" className="cb-btn cb-btn-primary" onClick={() => setOpen({ kind: 'add-machine' })}
            disabled={!dealers || dealers.length === 0 || categories.length === 0}
            title={dealers && dealers.length === 0 ? 'Add a dealer first' : undefined}>
            + Add machine
          </button>
        ) : (
          <button type="button" className="cb-btn cb-btn-primary" onClick={() => setOpen({ kind: 'add-dealer' })}>
            + Add dealer
          </button>
        )}
      </div>

      {view === 'machines' && open?.kind === 'add-machine' && dealers && (
        <MachineForm
          dealers={dealers}
          categories={categories}
          onSaved={(m) => onMachineSaved(m, true)}
          onCancel={() => setOpen(null)}
        />
      )}
      {view === 'dealers' && open?.kind === 'add-dealer' && (
        <DealerForm states={states} onSaved={(d) => onDealerSaved(d, '{name} added. Add their machines next.')} onCancel={() => setOpen(null)} />
      )}

      {view === 'machines' ? (
        <>
          <div className="cb-pill-group" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`cb-pill ${category === '' ? 'active' : ''}`}
              onClick={() => { setCategory(''); setPage(0); }}
            >
              All categories
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`cb-pill ${category === c.id ? 'active' : ''}`}
                onClick={() => { setCategory(c.id); setPage(0); }}
              >
                {c.label} · {c.live}/{c.total}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <div className="cb-pill-group">
              {VISIBILITY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`cb-pill ${visibility === tab.value ? 'active' : ''}`}
                  onClick={() => { setVisibility(tab.value); setPage(0); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, flex: '1 1 240px', minWidth: 0 }}>
              <input
                className="cb-input"
                type="search"
                placeholder="Machine, brand or dealer"
                aria-label="Search machines, brands or dealers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="submit" className="cb-btn cb-btn-ghost">Search</button>
            </form>
          </div>

          {catalogueFailed ? (
            <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
              <div className="cb-tiny" style={{ marginBottom: 10 }}>
                Couldn't load the catalogue, so this is not a count of zero.
              </div>
              <button type="button" className="cb-btn cb-btn-link" onClick={() => setReload((n) => n + 1)}>
                Try again →
              </button>
            </div>
          ) : catalogueLoading && !catalogue ? (
            <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
          ) : !catalogue || catalogue.equipment.length === 0 ? (
            <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
              <span className="cb-tiny">
                {counts && counts.total === 0
                  ? 'No machines yet. Add a dealer under Dealers, then add their machines here.'
                  : 'No machines match.'}
              </span>
            </div>
          ) : (
            <div className="cb-card" style={{ padding: 0, opacity: catalogueLoading ? 0.6 : 1 }}>
              {catalogue.equipment.map((m, i) => {
                const last = i === catalogue.equipment.length - 1;
                if (open?.kind === 'edit-machine' && open.id === m.id && dealers) {
                  return (
                    <div key={m.id} style={{ padding: 12, borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
                      <MachineForm
                        machine={m}
                        dealers={dealers}
                        categories={categories}
                        onSaved={(saved) => onMachineSaved(saved, false)}
                        onCancel={() => setOpen(null)}
                      />
                    </div>
                  );
                }
                return (
                  <MachineRow
                    key={m.id}
                    machine={m}
                    last={last}
                    onEdit={() => setOpen({ kind: 'edit-machine', id: m.id })}
                    onSetActive={(active) => setMachineActive(m, active)}
                  />
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
        </>
      ) : dealersFailed ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="cb-tiny" style={{ marginBottom: 10 }}>Couldn't load the dealers.</div>
          <button type="button" className="cb-btn cb-btn-link" onClick={() => setDealersReload((n) => n + 1)}>
            Try again →
          </button>
        </div>
      ) : !dealers ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : dealers.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">No dealers yet. Add the first one above.</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {dealers.map((d, i) => {
            const last = i === dealers.length - 1;
            if (open?.kind === 'edit-dealer' && open.id === d.id) {
              return (
                <div key={d.id} style={{ padding: 12, borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
                  <DealerForm dealer={d} states={states} onSaved={(saved) => onDealerSaved(saved, '{name} saved')} onCancel={() => setOpen(null)} />
                </div>
              );
            }
            return (
              <DealerRow
                key={d.id}
                dealer={d}
                last={last}
                claimsOpen={open?.kind === 'claims' && open.id === d.id}
                onClaims={() => setOpen(open?.kind === 'claims' && open.id === d.id ? null : { kind: 'claims', id: d.id })}
                onClaimsSaved={(saved) => onDealerSaved(saved, "{name}'s listing updated")}
                onCloseClaims={() => setOpen(null)}
                onEdit={() => setOpen({ kind: 'edit-dealer', id: d.id })}
                onSetActive={(active) => setDealerActive(d, active)}
              />
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

function MachineRow({ machine: m, last, onEdit, onSetActive }: {
  machine: AdminMachine;
  last: boolean;
  onEdit: () => void;
  onSetActive: (active: boolean) => void;
}) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
            #M-{m.id.slice(-6).toUpperCase()}
          </span>
          <span style={{ fontWeight: 500 }}>{m.title}</span>
          {m.brand && <span className="cb-small" style={{ marginLeft: 6 }}>· {m.brand}</span>}
        </div>
        <span className="cb-mono cb-tiny" style={{ color: m.live ? 'var(--cb-sage)' : 'var(--cb-ember)', whiteSpace: 'nowrap' }}>
          ● {m.live ? 'LIVE' : 'OFF'}
        </span>
      </div>

      <div className="cb-small" style={{ marginBottom: 6 }}>
        <span className="cb-mono">{priceLine(m)}</span> · for {MODE_LABEL[m.mode] ?? m.mode.toLowerCase()}
        {m.condition === 'USED' && (
          <span className="cb-chip cb-chip-wheat" style={{ marginLeft: 8 }}>
            used{m.yearMade ? ` · ${m.yearMade}` : ''}
          </span>
        )}
        {m.powerHp != null && <span className="cb-small"> · {m.powerHp} hp</span>}
      </div>

      <div className="cb-tiny" style={{ color: 'var(--cb-ink-2)' }}>
        {m.dealer.name}
        {m.dealer.verified ? ' ✓' : ''} · {m.location}, {m.state}
        {' · '}
        {m.enquiries > 0 ? (
          <Link to="/admin/enquiries" style={{ color: 'inherit' }}>
            {m.enquiries === 1 ? '1 enquiry' : `${m.enquiries} enquiries`}
          </Link>
        ) : '0 enquiries'}
      </div>

      {m.hiddenBecause.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {m.hiddenBecause.map((reason) => (
            <li key={reason} className="cb-tiny" style={{ color: 'var(--cb-ember)' }}>✕ {reason}</li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
        {m.active ? (
          <ConfirmButton
            label="Take off /equipment"
            confirmLabel="Farmers stop seeing it. Take it off?"
            onConfirm={() => onSetActive(false)}
          />
        ) : (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onSetActive(true)}>
            Put back on the catalogue
          </button>
        )}
      </div>
    </div>
  );
}

function DealerRow({
  dealer: d, last, claimsOpen, onClaims, onClaimsSaved, onCloseClaims, onEdit, onSetActive,
}: {
  dealer: AdminDealer;
  last: boolean;
  claimsOpen: boolean;
  onClaims: () => void;
  onClaimsSaved: (d: AdminDealer) => void;
  onCloseClaims: () => void;
  onEdit: () => void;
  onSetActive: (active: boolean) => void;
}) {
  const off = d.machines - d.live;
  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>{d.name}</span>
          {d.verified && <span className="cb-chip cb-chip-sage" style={{ marginLeft: 8 }}>verified</span>}
          {d.smamEmpanelled && <span className="cb-chip cb-chip-sage" style={{ marginLeft: 8 }}>SMAM</span>}
        </div>
        <span className="cb-mono cb-tiny" style={{ color: d.active ? 'var(--cb-sage)' : 'var(--cb-ink-3)', whiteSpace: 'nowrap' }}>
          ● {d.active ? 'ACTIVE' : 'OFF'}
        </span>
      </div>

      <div className="cb-small" style={{ marginBottom: 8 }}>
        {d.location}, {d.state} · rating {d.rating.toFixed(1)} · {d.machines} machines, {d.live} live
        {off > 0 ? `, ${off} off` : ''}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span className={`cb-chip ${d.verified ? 'cb-chip-sage' : ''}`}>
          Verified {d.verified ? '✓ claimed' : '✕ not yet'}
        </span>
        <span className={`cb-chip ${d.smamEmpanelled ? 'cb-chip-sage' : ''}`}>
          SMAM {d.smamEmpanelled ? '✓ claimed' : '✕ not yet'}
        </span>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onClaims}>
          {claimsOpen ? 'Hide claims' : 'Claims'}
        </button>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
        {d.active ? (
          <ConfirmButton
            label="Take dealer off /equipment"
            confirmLabel={`All ${d.machines} of their machines leave /equipment. Take it off?`}
            onConfirm={() => onSetActive(false)}
          />
        ) : (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onSetActive(true)}>
            Put back on the catalogue
          </button>
        )}
      </div>

      {claimsOpen && <ClaimsForm dealer={d} onSaved={onClaimsSaved} onCancel={onCloseClaims} />}
    </div>
  );
}
