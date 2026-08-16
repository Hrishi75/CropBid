// =============================================================================
// LiveShelf — the real shop, for a signed-in consumer
// =============================================================================
// The storefront's demo rails (LandingPage's PRODUCTS/PACKS) are a marketing
// catalogue: hand-written, prerendered, and not for sale. They do a real job for
// a stranger landing on the homepage, but a signed-in shopper needs the
// opposite — the actual lots a farmer has opened to retail, which they can put
// in an order right now.
//
// So this replaces the rails for CONSUMER accounts rather than sitting
// alongside them: showing both would mix buyable products with unbuyable
// decoration on one page, and the shopper has no way to tell which is which.
//
// THE SHELF IS LOCAL, AND THAT IS THE POINT
// A 2 kg order cannot be trucked across a state. Nashik and Nagpur are both in
// Maharashtra and 600 km apart, so a state-level filter would happily show a
// Nagpur household a Nashik farm and the delivery would simply never happen.
// The shelf is therefore filtered to the shopper's own city, and a shopper with
// no city set is asked for one before they see any produce — an order they
// cannot receive is worse than an empty shop.
//
// This applies to CONSUMER only. Farmers and buyers deal in lots that move by
// the tonne, where freight across a state is ordinary, so their surfaces stay
// national.
//
// A FLAT GRID, NOT FIVE RAILS. Real retail inventory starts small — a handful
// of listings in one city — and five category rails holding one item each looks
// broken. One grid stays honest at any size, and the header search narrows it.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

// Server caps `limit` at 50 (browse.service), so asking for more is pointless.
const SHELF_LIMIT = 50;

interface RetailCity { city: string; state: string }

function ShelfCard({ listing }: { listing: Listing }) {
  const unit = listing.unit.toLowerCase();
  const image = listing.images[0] || cropImageFor(listing.cropName);
  const price = listing.retailPricePerUnit;
  const href = `/shop/${listing.id}`;

  return (
    <div className="st-card">
      <Link to={href} className="st-card-img" aria-label={`${listing.cropName}${listing.cropVariety ? ` — ${listing.cropVariety}` : ''}`}>
        {image
          ? <img src={image} alt={listing.cropName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 44 }}>🌾</span>}
        <span className="st-grade">{listing.organic ? 'Organic' : `Grade ${listing.qualityGrade}`}</span>
      </Link>
      <div className="st-card-body">
        <div className="st-name">{listing.cropName}</div>
        <div className="st-meta">
          {listing.cropVariety ? `${listing.cropVariety} · ` : ''}{listing.location}
        </div>
        <div className="st-qty">{listing.remainingQuantity} {unit} left</div>
        <div className="st-price-row">
          <div>
            <div className="st-price">
              {price != null ? formatCurrency(price, listing.currency) : '—'}
              <span className="st-unit">/{unit}</span>
            </div>
          </div>
          <Link to={href} className="st-add">ADD</Link>
        </div>
      </div>
    </div>
  );
}

// Asked once, before any produce is shown, and re-openable from the header
// chip. Saving writes User.location through the ordinary account endpoint, so
// the city doubles as the checkout's default delivery address.
function CityPicker({
  cities,
  current,
  onSaved,
  onCancel,
}: {
  cities: RetailCity[];
  current?: string | null;
  onSaved: (city: string) => void;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState('');

  async function choose(city: string) {
    setSaving(city);
    try {
      const { data } = await api.patch('/auth/me', { location: city });
      onSaved(data.user?.location ?? city);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not save your city');
      setSaving('');
    }
  }

  return (
    <section className="st-rail">
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">Delivery</span>
          <h2 className="st-rail-title">Where should we deliver?</h2>
        </div>
      </div>

      <div className="cb-card" style={{ padding: 24 }}>
        <p className="cb-body" style={{ marginBottom: 4 }}>
          Fresh produce travels short distances. Pick your city and we'll show you
          the farms that can actually reach you.
        </p>

        {cities.length === 0 ? (
          <p className="cb-small" style={{ color: 'var(--cb-ink-3)', marginTop: 12 }}>
            No farm is selling direct anywhere yet. Check back shortly — growers open
            lots for retail as they harvest.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {cities.map((c) => (
              <button
                key={`${c.city}-${c.state}`}
                type="button"
                className={`cb-pill ${current?.toLowerCase() === c.city.toLowerCase() ? 'active' : ''}`}
                disabled={saving !== ''}
                onClick={() => choose(c.city)}
              >
                {saving === c.city ? 'Saving…' : c.city}
                <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)', marginLeft: 6 }}>{c.state}</span>
              </button>
            ))}
          </div>
        )}

        {onCancel && (
          <div style={{ marginTop: 18 }}>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        )}
      </div>
    </section>
  );
}

export function LiveShelf({ query }: { query?: string }) {
  const { user, updateUser } = useAuth();
  const city = user?.location?.trim() || '';

  // The shelf is stored WITH the city it was fetched for, so "still loading"
  // can be derived rather than set. Two things fall out of that: no synchronous
  // setState inside the effect (which cascades renders, and which the lint rule
  // rightly rejects), and no window where the previous city's produce is on
  // screen under the new city's heading — changing city makes the tag stop
  // matching, which IS the loading state.
  const [shelf, setShelf] = useState<{ city: string; listings: Listing[] } | null>(null);
  const [cities, setCities] = useState<RetailCity[]>([]);
  const [changingCity, setChangingCity] = useState(false);

  // Which cities can be served at all. Fetched regardless of whether the
  // shopper has a city, because the header chip lets them change it at any time.
  useEffect(() => {
    let on = true;
    api.get('/browse/cities')
      .then(({ data }) => { if (on) setCities(data ?? []); })
      .catch(() => { if (on) setCities([]); });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    // No city means no shelf to fetch — the picker is rendering instead, and it
    // never reads this state.
    if (!city) return;

    let on = true;
    api.get('/browse', { params: { directSale: true, location: city, limit: SHELF_LIMIT } })
      // An empty shelf and a failed fetch look the same to the shopper, and both
      // are "nothing to buy right now" — no error state worth its own UI.
      .then(({ data }) => { if (on) setShelf({ city, listings: data.listings ?? [] }); })
      .catch(() => { if (on) setShelf({ city, listings: [] }); });
    return () => { on = false; };
  }, [city]);

  // Null until this city's own results have landed.
  const listings = shelf?.city === city ? shelf.listings : null;

  function handleCitySaved(next: string) {
    if (user) updateUser({ ...user, location: next });
    setChangingCity(false);
  }

  if (!city || changingCity) {
    return (
      <CityPicker
        cities={cities}
        current={city || null}
        onSaved={handleCitySaved}
        onCancel={city ? () => setChangingCity(false) : undefined}
      />
    );
  }

  const q = query?.trim().toLowerCase() ?? '';
  const visible = (listings ?? []).filter((l) =>
    !q || [l.cropName, l.cropVariety, l.location].filter(Boolean).join(' ').toLowerCase().includes(q));

  return (
    <section id="shelf" className="st-rail">
      <div className="st-rail-head">
        <div>
          <span className="cb-eyebrow">
            {q ? `${visible.length} ${visible.length === 1 ? 'item' : 'items'} found` : 'Picked and packed by the grower'}
          </span>
          <h2 className="st-rail-title">
            {q ? `Results for “${query!.trim()}”` : 'Available now'}
          </h2>
        </div>
        <button
          type="button"
          className="cb-btn cb-btn-ghost cb-btn-sm"
          onClick={() => setChangingCity(true)}
        >
          Delivering to {city} · change
        </button>
      </div>

      {listings === null ? (
        <div className="cn-grid">
          <Skeleton height={260} />
          <Skeleton height={260} />
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      ) : visible.length === 0 ? (
        <div className="cb-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <p className="cb-body" style={{ marginBottom: 4 }}>
            {q ? 'Nothing matches that search in ' : 'No farm near '}{city}{q ? '.' : ' is selling direct yet.'}
          </p>
          <p className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
            We only show produce that can actually reach you — fresh food doesn't
            travel well across a state.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="ghost" onClick={() => setChangingCity(true)}>Change city</Button>
          </div>
        </div>
      ) : (
        <div className="cn-grid">
          {visible.map((l) => <ShelfCard key={l.id} listing={l} />)}
        </div>
      )}
    </section>
  );
}
