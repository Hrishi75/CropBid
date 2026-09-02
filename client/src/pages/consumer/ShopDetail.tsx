// =============================================================================
// ShopDetail — one counter, and everything on it
// =============================================================================
// The middle step of the retail journey: city → SHOP → item → cart. A shopper
// arrives here having already chosen who they are buying from, so this page
// answers "what have they got, and at what price", and nothing else.
//
// The lots are rendered with the same ShelfCard the storefront uses, so adding
// from a shop behaves identically to adding from the city shelf — same stepper,
// same kilograms, same cart. A second card component that drifted from the
// first is exactly the bug this avoids.
//
// WHY THE CITY IS A QUERY PARAM AND NOT JUST THE PATH
// The API refuses a shop whose stock is not in the asked-for city. Without
// that, a shared link would be a way to order across cities that the storefront
// itself refuses, and a 2 kg order cannot be trucked across a state.
// =============================================================================

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { pricePerKg } from '../../utils/units';
import { SELLER_TYPE_LABEL, shopTypeLabel } from '../../utils/partner';
import { laneMeta } from '../../utils/delivery';
import { Skeleton } from '../../components/ui/Skeleton';
import { ShelfCard } from './LiveShelf';
import { loadGuestCity } from '../../utils/retailCity';
import api from '../../lib/axios';
import type { Listing, SellerType } from '../../types';

interface ShopHeader {
  id: string;
  name: string;
  sellerType: SellerType;
  shopType: string | null;
  city: string;
  state: string;
  verified: boolean;
  organicCertified: boolean;
  certificationBody: string | null;
  itemCount: number;
}

export function ShopDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const city = user ? (user.location?.trim() || '') : loadGuestCity().trim();

  // The result is stored WITH the shop and city it was fetched for, so "still
  // loading" is derived rather than set. Same pattern as LiveShelf and
  // cartLines, and for the same two reasons: no synchronous setState inside the
  // effect (which cascades renders, and which the lint rule rightly rejects),
  // and no window where the previous shop's shelf sits under the new shop's
  // name — changing shop makes the tag stop matching, which IS the loading state.
  const [fetched, setFetched] = useState<{
    key: string;
    data: { shop: ShopHeader; listings: Listing[] } | null;
  } | null>(null);

  const key = `${id}:${city}`;

  useEffect(() => {
    let on = true;
    api.get(`/browse/shops/${id}`, { params: city ? { city } : {} })
      .then(({ data }) => { if (on) setFetched({ key, data: { shop: data.shop, listings: data.listings ?? [] } }); })
      // A shop that is gone, closed for the day, or in another city are one
      // answer to a shopper: there is nothing to buy here. The API deliberately
      // does not distinguish them either.
      .catch(() => { if (on) setFetched({ key, data: null }); });
    return () => { on = false; };
  }, [id, city, key]);

  const state: { status: 'loading' } | { status: 'gone' } | { status: 'ok'; shop: ShopHeader; listings: Listing[] } =
    fetched?.key !== key ? { status: 'loading' }
      : fetched.data === null ? { status: 'gone' }
        : { status: 'ok', ...fetched.data };

  if (state.status === 'loading') {
    return (
      <div className="cb-page">
        <Skeleton height={90} />
        <div className="cn-grid" style={{ marginTop: 24 }}>
          <Skeleton height={260} />
          <Skeleton height={260} />
          <Skeleton height={260} />
        </div>
      </div>
    );
  }

  if (state.status === 'gone') {
    return (
      <div className="cb-page">
        <div className="cb-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p className="cb-body" style={{ marginBottom: 4 }}>This shop isn't open for orders right now.</p>
          <p className="cb-small" style={{ color: 'var(--cb-ink-3)' }}>
            It may have sold out for the day, or it may not deliver to {city || 'your city'}.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link to="/" className="cb-btn cb-btn-ghost">Back to the shops</Link>
          </div>
        </div>
      </div>
    );
  }

  const { shop, listings } = state;
  const kind = shop.sellerType === 'LOCAL_SHOP'
    ? (shopTypeLabel(shop.shopType) ?? 'Local shop')
    : SELLER_TYPE_LABEL[shop.sellerType];
  const lane = laneMeta(shop.sellerType);

  // Cheapest thing on the shelf, so the header can anchor the shopper's
  // expectation the same way the shop card in the storefront did.
  const prices = listings
    .filter((l) => l.retailPricePerUnit != null)
    .map((l) => pricePerKg(l.retailPricePerUnit!, l.unit));

  return (
    <div className="cb-page">
      <div className="cb-eyebrow" style={{ marginBottom: 16 }}>
        <Link to="/">← Shop</Link> · {shop.city}
      </div>

      <header className="cn-shop-header">
        <h1 className="cb-page-title">{shop.name}</h1>
        <div className="cb-body" style={{ color: 'var(--cb-ink-3)', marginTop: 6 }}>
          {kind} · {shop.city}, {shop.state}
        </div>
        {/* The delivery promise is the first thing a shopper needs from a shop
            page: it decides whether this counter is any use to them tonight. */}
        <div className="cn-lane-banner" style={{ ['--lane-color' as string]: lane.color }}>
          <strong>{lane.promise}</strong>
          <span>{lane.rationale}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {shop.verified && <span className="cb-chip cb-chip-sage">✓ Verified</span>}
          {shop.organicCertified && (
            <span className="cb-chip cb-chip-sage">
              ☘ Organic{shop.certificationBody ? ` · ${shop.certificationBody}` : ''}
            </span>
          )}
          <span className="cb-chip">
            {shop.itemCount} {shop.itemCount === 1 ? 'item' : 'items'} in stock
          </span>
        </div>
      </header>

      <section className="st-rail" style={{ marginTop: 8 }}>
        <div className="st-rail-head">
          <div>
            <span className="cb-eyebrow">On the shelf today</span>
            <h2 className="st-rail-title">
              {prices.length > 0
                ? `From ${formatCurrency(Math.min(...prices), listings[0].currency)}/kg`
                : 'Available now'}
            </h2>
          </div>
        </div>

        <div className="cn-grid">
          {listings.map((l) => (
            <ShelfCard key={l.id} listing={l} role={user?.role} shopping />
          ))}
        </div>
      </section>
    </div>
  );
}
