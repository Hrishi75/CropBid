// =============================================================================
// AdminInputs — The seeds & fertiliser catalogue, as ops see it and run it
// =============================================================================
// /inputs shows a farmer only what the licence gate lets through: seed,
// fertiliser and crop protection appear only once the shop holds the licence for
// that category (CLAUDE.md §10). This page shows every row, says whether a farmer
// can see it and what each hidden one is waiting on, and is where ops add shops
// and products and enter a shop's licences.
//
// Live/hidden comes from the server running the same gate /inputs runs, so this
// page cannot disagree with what a farmer sees. It never receives a licence
// number or a shop's phone number, including right after saving one.
// =============================================================================

import { useState, useEffect, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import api from '../../lib/axios';
import { ConfirmButton } from './inputs/ConfirmButton';
import { LicenceForm } from './inputs/LicenceForm';
import { ProductForm } from './inputs/ProductForm';
import { ShopForm } from './inputs/ShopForm';
import {
  apiMessage,
  LICENCE_KINDS,
  type AdminInput,
  type AdminSupplier,
  type CategoryCount,
} from './inputs/types';

interface CatalogueResponse {
  inputs: AdminInput[];
  total: number;
  counts: { total: number; live: number };
  categories: CategoryCount[];
}

type View = 'products' | 'shops';
type Visibility = '' | 'live' | 'hidden';

// At most one form open at a time, so a half-typed product is never hidden
// behind another form the admin opened and forgot.
type Open =
  | { kind: 'add-product' }
  | { kind: 'edit-product'; id: string }
  | { kind: 'add-shop' }
  | { kind: 'edit-shop'; id: string }
  | { kind: 'licences'; id: string }
  | null;

const VISIBILITY_TABS: { value: Visibility; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'live', label: 'Live on /inputs' },
  { value: 'hidden', label: 'Hidden' },
];

// Same formatting as /inputs: fertiliser MRPs carry paise (urea is ₹266.50),
// and rounding would misquote a statutory price.
function rupees(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `₹${rounded.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AdminInputs() {
  const [view, setView] = useState<View>('products');
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

  const [suppliers, setSuppliers] = useState<AdminSupplier[] | null>(null);
  const [suppliersFailed, setSuppliersFailed] = useState(false);
  const [suppliersReload, setSuppliersReload] = useState(0);

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

    api.get<CatalogueResponse>(`/admin/agri-inputs?${params}`)
      .then((res) => {
        if (!current) return;
        setCatalogue(res.data);
        setSettledKey(requestKey);
      })
      .catch((err) => {
        console.error('Failed to load the inputs catalogue:', err);
        if (!current) return;
        setFailedKey(requestKey);
        setSettledKey(requestKey);
      });

    return () => { current = false; };
  }, [category, visibility, query, page, requestKey]);

  useEffect(() => {
    let current = true;
    api.get<{ suppliers: AdminSupplier[] }>('/admin/agri-inputs/suppliers')
      .then((res) => {
        if (!current) return;
        setSuppliers(res.data.suppliers);
        setSuppliersFailed(false);
      })
      .catch((err) => {
        console.error('Failed to load input suppliers:', err);
        if (current) setSuppliersFailed(true);
      });
    return () => { current = false; };
  }, [suppliersReload]);

  // Any write can move a count on either tab (a licence puts products live, a
  // new product changes a shop's totals), so both are fetched again.
  function refresh() {
    setReload((n) => n + 1);
    setSuppliersReload((n) => n + 1);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
    setPage(0);
  }

  function onProductSaved(p: AdminInput, added: boolean) {
    setOpen(null);
    refresh();
    if (p.live) toast.success(`${p.title} ${added ? 'added, and live on /inputs' : 'saved'}`);
    else toast.success(`${p.title} saved. Hidden from farmers: ${p.hiddenBecause[0]?.toLowerCase()}`);
  }

  async function setProductActive(p: AdminInput, active: boolean) {
    try {
      await api.patch(`/admin/agri-inputs/${p.id}`, { active });
      toast.success(active ? `${p.title} is back on the catalogue` : `${p.title} taken off /inputs`);
      refresh();
    } catch (err) {
      toast.error(apiMessage(err, 'Could not update the product'));
    }
  }

  async function setShopActive(s: AdminSupplier, active: boolean) {
    try {
      await api.patch(`/admin/agri-inputs/suppliers/${s.id}`, { active });
      toast.success(active ? `${s.name} is back on the catalogue` : `${s.name} taken off /inputs`);
      refresh();
    } catch (err) {
      toast.error(apiMessage(err, 'Could not update the shop'));
    }
  }

  function onShopSaved(s: AdminSupplier, message: string) {
    setOpen(null);
    refresh();
    toast.success(message.replace('{name}', s.name));
  }

  const counts = catalogue?.counts;
  const categories = catalogue?.categories ?? [];
  const shopsWaiting = suppliers?.filter((s) => s.missingLicences.length > 0).length;
  const totalPages = catalogue ? Math.ceil(catalogue.total / LIMIT) : 0;

  return (
    <DashboardLayout>
      <div className="cb-section-head">
        <div>
          <div className="cb-page-eyebrow">
            Seeds & fertiliser · {counts ? `${counts.total.toLocaleString()} products` : '…'}
          </div>
          <h1 className="cb-page-title" style={{ marginTop: 12 }}>
            The inputs shelf,<br />
            <span className="cb-italic">hidden rows included.</span>
          </h1>
        </div>
      </div>

      <p className="cb-small" style={{ maxWidth: 680, marginTop: 0, marginBottom: 20, color: 'var(--cb-ink-2)' }}>
        Seed, fertiliser and crop protection appear on <span className="cb-mono">/inputs</span> only
        once the shop's licence for that category is on file. Enter a licence under Shops → Licences,
        after you have seen the document. Organic inputs, micronutrients and saplings need no licence
        and show as soon as they are added.
      </p>

      <div className="cb-kpi-strip" style={{ marginTop: 8, marginBottom: 24 }}>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Live on /inputs</div>
          <div className="cb-kpi-value">{counts ? counts.live : '—'}</div>
          <div className="cb-kpi-delta">what a farmer can see</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Hidden</div>
          <div className="cb-kpi-value">{counts ? counts.total - counts.live : '—'}</div>
          <div className="cb-kpi-delta">saved, not shown</div>
        </div>
        <div className="cb-kpi-cell">
          <div className="cb-kpi-label">Shops</div>
          <div className="cb-kpi-value">{suppliers ? suppliers.length : '—'}</div>
          <div className="cb-kpi-delta">
            {shopsWaiting === undefined ? 'seed & fertiliser sellers' : `${shopsWaiting} waiting on a licence`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="cb-pill-group">
          <button type="button" className={`cb-pill ${view === 'products' ? 'active' : ''}`} onClick={() => { setView('products'); setOpen(null); }}>
            Products
          </button>
          <button type="button" className={`cb-pill ${view === 'shops' ? 'active' : ''}`} onClick={() => { setView('shops'); setOpen(null); }}>
            Shops
          </button>
        </div>
        {view === 'products' ? (
          <button type="button" className="cb-btn cb-btn-primary" onClick={() => setOpen({ kind: 'add-product' })}
            disabled={!suppliers || suppliers.length === 0 || categories.length === 0}
            title={suppliers && suppliers.length === 0 ? 'Add a shop first' : undefined}>
            + Add product
          </button>
        ) : (
          <button type="button" className="cb-btn cb-btn-primary" onClick={() => setOpen({ kind: 'add-shop' })}>
            + Add shop
          </button>
        )}
      </div>

      {view === 'products' && open?.kind === 'add-product' && suppliers && (
        <ProductForm
          suppliers={suppliers}
          categories={categories}
          onSaved={(p) => onProductSaved(p, true)}
          onCancel={() => setOpen(null)}
        />
      )}
      {view === 'shops' && open?.kind === 'add-shop' && (
        <ShopForm onSaved={(s) => onShopSaved(s, '{name} added. Enter its licences next.')} onCancel={() => setOpen(null)} />
      )}

      {view === 'products' ? (
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
                placeholder="Product, brand or shop"
                aria-label="Search products, brands or shops"
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
          ) : !catalogue || catalogue.inputs.length === 0 ? (
            <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
              <span className="cb-tiny">
                {counts && counts.total === 0
                  ? 'No products yet. Add a shop under Shops, then add its products here.'
                  : 'No products match.'}
              </span>
            </div>
          ) : (
            <div className="cb-card" style={{ padding: 0, opacity: catalogueLoading ? 0.6 : 1 }}>
              {catalogue.inputs.map((p, i) => {
                const last = i === catalogue.inputs.length - 1;
                if (open?.kind === 'edit-product' && open.id === p.id && suppliers) {
                  return (
                    <div key={p.id} style={{ padding: 12, borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
                      <ProductForm
                        product={p}
                        suppliers={suppliers}
                        categories={categories}
                        onSaved={(saved) => onProductSaved(saved, false)}
                        onCancel={() => setOpen(null)}
                      />
                    </div>
                  );
                }
                return (
                  <ProductRow
                    key={p.id}
                    product={p}
                    last={last}
                    onEdit={() => setOpen({ kind: 'edit-product', id: p.id })}
                    onSetActive={(active) => setProductActive(p, active)}
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
      ) : suppliersFailed ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="cb-tiny" style={{ marginBottom: 10 }}>Couldn't load the shops.</div>
          <button type="button" className="cb-btn cb-btn-link" onClick={() => setSuppliersReload((n) => n + 1)}>
            Try again →
          </button>
        </div>
      ) : !suppliers ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}><span className="cb-tiny">Loading…</span></div>
      ) : suppliers.length === 0 ? (
        <div className="cb-card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="cb-tiny">No shops yet. Add the first one above.</span>
        </div>
      ) : (
        <div className="cb-card" style={{ padding: 0 }}>
          {suppliers.map((s, i) => {
            const last = i === suppliers.length - 1;
            if (open?.kind === 'edit-shop' && open.id === s.id) {
              return (
                <div key={s.id} style={{ padding: 12, borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
                  <ShopForm shop={s} onSaved={(saved) => onShopSaved(saved, '{name} saved')} onCancel={() => setOpen(null)} />
                </div>
              );
            }
            return (
              <SupplierRow
                key={s.id}
                supplier={s}
                last={last}
                licencesOpen={open?.kind === 'licences' && open.id === s.id}
                onLicences={() => setOpen(open?.kind === 'licences' && open.id === s.id ? null : { kind: 'licences', id: s.id })}
                onLicencesSaved={(saved) => onShopSaved(saved, "{name}'s licences saved")}
                onCloseLicences={() => setOpen(null)}
                onEdit={() => setOpen({ kind: 'edit-shop', id: s.id })}
                onSetActive={(active) => setShopActive(s, active)}
              />
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

function ProductRow({ product: p, last, onEdit, onSetActive }: {
  product: AdminInput;
  last: boolean;
  onEdit: () => void;
  onSetActive: (active: boolean) => void;
}) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <span className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)', marginRight: 8 }}>
            #I-{p.id.slice(-6).toUpperCase()}
          </span>
          <span style={{ fontWeight: 500 }}>{p.title}</span>
          {p.brand && <span className="cb-small" style={{ marginLeft: 6 }}>· {p.brand}</span>}
        </div>
        <span className="cb-mono cb-tiny" style={{ color: p.live ? 'var(--cb-sage)' : 'var(--cb-ember)', whiteSpace: 'nowrap' }}>
          ● {p.live ? 'LIVE' : 'HIDDEN'}
        </span>
      </div>

      <div className="cb-small" style={{ marginBottom: 6 }}>
        <span className="cb-mono">{rupees(p.pricePerPack)}</span> / {p.packSize}
        {p.composition ? ` · ${p.composition}` : ''}
        {p.cropNames.length > 0 ? ` · for ${p.cropNames.join(', ')}` : ''}
        {p.subsidised && (
          <span className="cb-chip cb-chip-wheat" style={{ marginLeft: 8 }}>statutory MRP</span>
        )}
      </div>

      <div className="cb-tiny" style={{ color: 'var(--cb-ink-2)' }}>
        {p.supplier.name}
        {p.supplier.verified ? ' ✓' : ''} · {p.supplier.location}, {p.supplier.state}
        {' · '}
        {p.enquiries === 1 ? '1 enquiry' : `${p.enquiries} enquiries`}
      </div>

      {p.hiddenBecause.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {p.hiddenBecause.map((reason) => (
            <li key={reason} className="cb-tiny" style={{ color: 'var(--cb-ember)' }}>✕ {reason}</li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
        {p.active ? (
          <ConfirmButton
            label="Take off /inputs"
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

function SupplierRow({
  supplier: s, last, licencesOpen, onLicences, onLicencesSaved, onCloseLicences, onEdit, onSetActive,
}: {
  supplier: AdminSupplier;
  last: boolean;
  licencesOpen: boolean;
  onLicences: () => void;
  onLicencesSaved: (s: AdminSupplier) => void;
  onCloseLicences: () => void;
  onEdit: () => void;
  onSetActive: (active: boolean) => void;
}) {
  const hidden = s.products - s.live;
  return (
    <div style={{ padding: '16px 20px', borderBottom: last ? 'none' : '1px solid var(--cb-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>{s.name}</span>
          {s.verified && <span className="cb-chip cb-chip-sage" style={{ marginLeft: 8 }}>verified</span>}
        </div>
        <span className="cb-mono cb-tiny" style={{ color: s.active ? 'var(--cb-sage)' : 'var(--cb-ink-3)', whiteSpace: 'nowrap' }}>
          ● {s.active ? 'ACTIVE' : 'OFF'}
        </span>
      </div>

      <div className="cb-small" style={{ marginBottom: 8 }}>
        {s.location}, {s.state} · rating {s.rating.toFixed(1)} · {s.products} products, {s.live} live
        {hidden > 0 ? `, ${hidden} hidden` : ''}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {LICENCE_KINDS.map(({ key, label }) => (
          <span key={key} className={`cb-chip ${s.licences[key] ? 'cb-chip-sage' : ''}`}>
            {label} licence {s.licences[key] ? '✓ on file' : '✕ none'}
          </span>
        ))}
      </div>

      {s.missingLicences.length > 0 && (
        <div className="cb-tiny" style={{ marginTop: 8, color: 'var(--cb-ember)' }}>
          Its own stock is waiting on: {s.missingLicences.map((l) => `${l} licence`).join(', ')}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onLicences}>
          {licencesOpen ? 'Hide licences' : 'Licences'}
        </button>
        <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
        {s.active ? (
          <ConfirmButton
            label="Take shop off /inputs"
            confirmLabel={`All ${s.products} of its products leave /inputs. Take it off?`}
            onConfirm={() => onSetActive(false)}
          />
        ) : (
          <button type="button" className="cb-btn cb-btn-link" style={{ fontSize: 12 }} onClick={() => onSetActive(true)}>
            Put back on the catalogue
          </button>
        )}
      </div>

      {licencesOpen && <LicenceForm shop={s} onSaved={onLicencesSaved} onCancel={onCloseLicences} />}
    </div>
  );
}
