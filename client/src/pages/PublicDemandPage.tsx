// =============================================================================
// Public Demand Page — /crop-demand · who is buying, right now
// =============================================================================
// An acquisition surface, not a working tool. A farmer searching "who is buying
// tomatoes in Maharashtra" should land here, see real standing demand, and sign
// up to fill it. The working board lives at /demand behind a login.
//
// NO BUYER IDENTITY REACHES THIS PAGE. /api/requirements/public returns the
// trade only — crop, volume, grade, price, destination, deadline, and the kind
// of business asking. That is deliberate and load-bearing: this page is
// prerendered into static HTML, so anything rendered here is permanently
// crawlable. Do not add a company name to it.
//
// Signed-in users are bounced to /demand by the route, so nobody works off the
// redacted copy when they have access to the real one.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { formatCurrency } from '../utils/currency';
import { companyTypeLabel } from '../utils/companyType';
import { ArcMark, ArrowIcon, CBFooter, SearchIcon } from './landing/shared';

interface PublicRequirement {
  cropName: string;
  cropVariety: string | null;
  remainingQuantity: number;
  unit: string;
  qualityGrade: string;
  pricePerUnit: number;
  currency: string;
  organic: boolean;
  deliveryLocation: string;
  deliveryState: string;
  neededBy: string | null;
  createdAt: string;
  buyerType: string | null;
}

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PublicDemandPage() {
  const [rows, setRows] = useState<PublicRequirement[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let on = true;
    api
      .get('/requirements/public?limit=48')
      .then(({ data }) => {
        if (!on) return;
        setRows(data.requirements || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        // A failed fetch leaves the page as its own pitch rather than an error.
        if (on) setRows([]);
      })
      .finally(() => {
        if (on) setLoaded(true);
      });
    return () => {
      on = false;
    };
  }, []);

  // Filtered in the browser over the loaded page, same as /schemes — the list
  // is capped at 48 rows, so a round trip per keystroke would buy nothing.
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.cropName, r.cropVariety, r.deliveryLocation, r.deliveryState]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  return (
    <div className="cb-landing rp">
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/signup" className="cb-btn cb-btn-primary">
            Start trading
            <ArrowIcon />
          </Link>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              🧺 Open demand · live
            </span>
            <h1 className="cb-h1">Buyers looking to purchase, right now</h1>
            <p className="cb-body rp-lede">
              Food processors, restaurant chains, exporters and retailers post what they need —
              crop, volume, grade, the price they'll pay and where it has to land. Sign up as a
              farmer to fill any of it at the posted price, or counter with your own.
            </p>
          </div>
        </div>

        <div className="sy-search">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a crop or a delivery town…"
            aria-label="Search open demand"
          />
        </div>

        {loaded && rows.length > 0 && (
          <p className="cb-small" style={{ color: 'var(--cb-ink-3)', marginBottom: 18 }}>
            Showing {results.length} of {total} open requirement{total === 1 ? '' : 's'}.
            Buyer names are shown to signed-in farmers.
          </p>
        )}

        {loaded && rows.length === 0 ? (
          <div className="cb-card" style={{ padding: 28, textAlign: 'center' }}>
            <p className="cb-body" style={{ marginBottom: 16 }}>
              No demand is open at this moment. New requirements are posted most days — create a
              free account and we'll notify you when a buyer wants your crop.
            </p>
            <Link to="/signup" className="cb-btn cb-btn-primary">
              Create a free account
              <ArrowIcon />
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {results.map((r, i) => {
              const unit = r.unit.toLowerCase();
              const type = companyTypeLabel(r.buyerType);
              const deadline = formatDeadline(r.neededBy);
              return (
                <div
                  // No ids are exposed on this endpoint, so the index is the
                  // only key available — the list is read-only and never
                  // reorders in place, so it is safe here.
                  key={`${r.cropName}-${r.deliveryLocation}-${i}`}
                  className="cb-card"
                  style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div style={{ fontWeight: 500 }}>
                    {r.cropName}
                    {r.cropVariety ? ` · ${r.cropVariety}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {type && <span className="cb-chip">{type}</span>}
                    <span className="cb-chip">Grade {r.qualityGrade}</span>
                    {r.organic && <span className="cb-chip cb-chip-sage">Organic only</span>}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                      gap: 14,
                    }}
                  >
                    <div>
                      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>WANTS</div>
                      <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
                        {formatCurrency(r.pricePerUnit, r.currency)}
                        <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}> /{unit}</span>
                      </div>
                    </div>
                    <div>
                      <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>QUANTITY</div>
                      <div className="cb-mono" style={{ fontSize: 16, fontWeight: 500 }}>
                        {r.remainingQuantity} {unit}
                      </div>
                    </div>
                  </div>

                  <div className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
                    Deliver to {r.deliveryLocation}, {r.deliveryState}
                    {deadline && ` · by ${deadline}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loaded && rows.length > 0 && (
          <div className="cb-card" style={{ padding: 24, marginTop: 28, textAlign: 'center' }}>
            <p className="cb-body" style={{ marginBottom: 16 }}>
              Sign up free as a farmer to see who is asking, fill any requirement at the posted
              price, and get told the moment a buyer wants your crop.
            </p>
            <Link to="/signup" className="cb-btn cb-btn-primary">
              Start selling on CropBid
              <ArrowIcon />
            </Link>
          </div>
        )}

        <p className="cb-small rp-foot">
          Demand shown here is live. Quantities move as requirements get filled, so what you see
          is what is still open. Prices are the buyer's posted price — a farmer can always counter
          with their own.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
