// =============================================================================
// LiveShelf — the shop, and the only produce the storefront ever shows
// =============================================================================
// This IS the marketplace on "/" now. It used to sit behind a signed-in
// CONSUMER account while the homepage showed a hand-written catalogue of demo
// lots to everyone else — cards carrying a village, a grade, a bid count and a
// live dot, none of it real. Visitors read them as farmers' listings, because
// nothing on a card said otherwise. So the catalogue is gone and this took its
// place for every viewer: what is on the shelf is what a farmer has actually
// opened for sale, and an empty shelf says so plainly.
//
// THE SHELF IS LOCAL FOR SHOPPERS, AND THAT IS THE POINT
// A 2 kg order cannot be trucked across a state. Nashik and Nagpur are both in
// Maharashtra and 600 km apart, so a state-level filter would happily show a
// Nagpur household a Nashik farm and the delivery would simply never happen.
// A shopper's shelf is therefore filtered to one city and to direct-sale lots,
// and a shopper with no city set is asked for one before they see any produce —
// an order they cannot receive is worse than an empty shop.
//
// Guests count as shoppers here: a stranger landing on the homepage is being
// offered a household pack, so they get the same local shelf and the same
// question. Farmers, buyers and admins are not — they deal in lots that move by
// the tonne, where freight across a state is ordinary, so they see the whole
// open market nationwide and are never asked for a delivery city.
//
// WHERE THE CITY LIVES depends on who is asking. A signed-in shopper's city is
// account state (User.location), so it also becomes their checkout default. A
// guest has no account to write to, so their choice is kept in localStorage —
// enough to browse, and it carries over if they sign up.
//
// A FLAT GRID, NOT FIVE RAILS. Real retail inventory starts small — a handful
// of listings in one city — and five category rails holding one item each looks
// broken. One grid stays honest at any size, and the header search narrows it.
//
// ADDING HAPPENS ON THE CARD. The shelf is where a basket gets filled, so ADD
// puts the lot straight in the cart and then turns into the quantity control
// for it. Making the shopper open a product page to add each of six items
// would be six page loads to buy a week's vegetables.
// =============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { formatCurrency } from '../../utils/currency';
import { cropImageFor } from '../../utils/cropImages';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { QuantityStepper } from './QuantityStepper';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import type { Listing } from '../../types';

// Server caps `limit` at 50 (browse.service), so asking for more is pointless.
const SHELF_LIMIT = 50;

// A guest's city. Signed-in shoppers keep theirs on the account instead, so
// this key is only ever read when there is no user.
const GUEST_CITY_KEY = 'cb-shelf-city';

function loadGuestCity(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(GUEST_CITY_KEY) ?? '';
  } catch {
    return ''; // private mode — the picker just asks again
  }
}

function saveGuestCity(city: string): void {
  try {
    window.localStorage.setItem(GUEST_CITY_KEY, city);
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

interface RetailCity { city: string; state: string }

// Where a card goes depends on who clicked it. Only a CONSUMER can open the
// retail product page — /shop/:id is role-gated — so sending anyone else there
// means ProtectedRoute silently bounces them off their own homepage. A farmer
// or buyer gets the shared listing detail, which is built for them, and a guest
// is asked to join, which is the point of showing them a shelf at all.
function listingHref(listing: Listing, role?: string): string {
  if (role === 'CONSUMER') return `/shop/${listing.id}`;
  if (role) return `/listings/${listing.id}`;
  return '/signup';
}

function ShelfCard({ listing, role, shopping }: { listing: Listing; role?: string; shopping: boolean }) {
  const { quantityOf, add, setQuantity, remove } = useCart();
  const unit = listing.unit.toLowerCase();
  const image = listing.images[0] || cropImageFor(listing.cropName);
  const price = listing.retailPricePerUnit;
  const href = listingHref(listing, role);
  const inCart = quantityOf(listing.id);

  // Only a signed-in shopper has a basket to fill. A guest is shopping too, but
  // their ADD has to go through signup first, and a farmer or buyer is being
  // shown the lot rather than sold it.
  const canAddToCart = role === 'CONSUMER';

  // The opening quantity, matching the product page: one kilo, or the smallest
  // sensible slice of a bigger denomination.
  const firstQty = Math.min(listing.unit === 'KG' ? 1 : 0.5, listing.remainingQuantity);

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
          {!canAddToCart ? (
            /* A guest is being sold a pack too, so their card still says ADD —
               it just lands on signup, which is the funnel. A farmer or buyer
               gets VIEW, onto the lot page built for them. */
            <Link to={href} className="st-add">{shopping ? 'ADD' : 'VIEW'}</Link>
          ) : inCart > 0 ? (
            <QuantityStepper
              value={inCart}
              onChange={(q) => setQuantity(listing.id, q)}
              unit={listing.unit}
              max={listing.remainingQuantity}
              size="sm"
              showUnit={false}
              onEmpty={() => remove(listing.id)}
            />
          ) : (
            <button
              type="button"
              className="st-add"
              onClick={() => add(listing, firstQty)}
              // Nothing left to add, and a card that lets you add zero kilos
              // would only fail at the checkout.
              disabled={price == null || listing.remainingQuantity <= 0}
            >
              ADD
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Asked once, before any produce is shown, and re-openable from the header
// chip. A signed-in shopper's pick writes User.location through the ordinary
// account endpoint, so the city doubles as the checkout's default delivery
// address; a guest has no account, so theirs stays in localStorage until they
// have one.
function CityPicker({
  cities,
  current,
  signedIn,
  onSaved,
  onCancel,
}: {
  cities: RetailCity[];
  current?: string | null;
  signedIn: boolean;
  onSaved: (city: string) => void;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState('');

  async function choose(city: string) {
    if (!signedIn) {
      saveGuestCity(city);
      onSaved(city);
      return;
    }
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

  // Who is being sold a pack, and who is browsing lots. Guests count as
  // shoppers: the storefront is what a stranger lands on, and a household pack
  // is what it offers them. Farmers, buyers and admins work in lots that move
  // by the tonne, where freight across a state is ordinary — so they get the
  // whole open market, nationwide, and no delivery city is asked for.
  const shopping = !user || user.role === 'CONSUMER';

  // A guest's city has nowhere to live but this component, so it is state; a
  // signed-in shopper's comes off the account, which is the single source of
  // truth for them (the header chip and checkout read the same field).
  const [guestCity, setGuestCity] = useState(loadGuestCity);
  const city = !shopping ? '' : user ? (user.location?.trim() || '') : guestCity;

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
    if (!shopping) return;
    let on = true;
    api.get('/browse/cities')
      .then(({ data }) => { if (on) setCities(data ?? []); })
      .catch(() => { if (on) setCities([]); });
    return () => { on = false; };
  }, [shopping]);

  useEffect(() => {
    // A shopper with no city has no shelf to fetch — the picker is rendering
    // instead, and it never reads this state.
    if (shopping && !city) return;

    let on = true;
    const params = shopping
      ? { directSale: true, location: city, limit: SHELF_LIMIT }
      : { limit: SHELF_LIMIT };
    api.get('/browse', { params })
      // An empty shelf and a failed fetch look the same to the viewer, and both
      // are "nothing here right now" — no error state worth its own UI.
      .then(({ data }) => { if (on) setShelf({ city, listings: data.listings ?? [] }); })
      .catch(() => { if (on) setShelf({ city, listings: [] }); });
    return () => { on = false; };
  }, [shopping, city]);

  // Null until this city's own results have landed.
  const listings = shelf?.city === city ? shelf.listings : null;

  function handleCitySaved(next: string) {
    if (user) updateUser({ ...user, location: next });
    else setGuestCity(next);
    setChangingCity(false);
  }

  if (shopping && (!city || changingCity)) {
    return (
      <CityPicker
        cities={cities}
        current={city || null}
        signedIn={!!user}
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
            {q
              ? `${visible.length} ${visible.length === 1 ? 'item' : 'items'} found`
              : shopping ? 'Picked and packed by the grower' : 'Every lot open on the market'}
          </span>
          <h2 className="st-rail-title">
            {q ? `Results for “${query!.trim()}”` : 'Available now'}
          </h2>
        </div>
        {shopping && (
          <button
            type="button"
            className="cb-btn cb-btn-ghost cb-btn-sm"
            onClick={() => setChangingCity(true)}
          >
            Delivering to {city} · change
          </button>
        )}
      </div>

      {listings === null ? (
        <div className="cn-grid">
          <Skeleton height={260} />
          <Skeleton height={260} />
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      ) : visible.length === 0 ? (
        // The honest empty shop. This is the state the homepage sits in until a
        // farmer lists something, and it is the whole point of the change: no
        // invented lot fills the gap.
        <div className="cb-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <p className="cb-body" style={{ marginBottom: 4 }}>
            {q
              ? `Nothing matches that search${shopping ? ` in ${city}` : ''}.`
              : shopping
                ? `No farm near ${city} is selling direct yet.`
                : 'No lots are open on the market right now.'}
          </p>
          <p className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
            {shopping
              ? "We only show produce that can actually reach you — fresh food doesn't travel well across a state."
              : 'New lots appear here the moment a farmer lists one.'}
          </p>
          {shopping && (
            <div style={{ marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setChangingCity(true)}>Change city</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="cn-grid">
          {visible.map((l) => <ShelfCard key={l.id} listing={l} role={user?.role} shopping={shopping} />)}
        </div>
      )}
    </section>
  );
}
