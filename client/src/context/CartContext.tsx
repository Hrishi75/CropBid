// =============================================================================
// Cart Context — the shopper's basket
// =============================================================================
// Retail is a multi-item habit. Someone buying two kilos of tomatoes is very
// likely also buying onions and a kilo of rice, and sending them through a
// one-listing checkout three times means three address forms for one shop. So
// the basket lives here, above the routes, and the product surfaces only add
// to it.
//
// WHAT IS STORED, AND WHY IT IS A SNAPSHOT
// Each row keeps the listing's id AND a copy of what it looked like when it
// went in: name, photo, price, unit, grower. That copy exists so the cart and
// the sticky bar paint instantly on any page without refetching every listing
// first. It is NOT the truth about price or stock — a basket can sit for days
// while a lot sells out or the grower re-prices it. The cart and checkout
// pages re-fetch every line (see cartLines.ts) and bill against the live
// listing; the snapshot is only ever the fast first paint.
//
// PERSISTENCE IS PER-ACCOUNT
// The key carries the user id, so a shared browser never shows one shopper the
// other's basket, and signing out leaves the basket to be found on the next
// sign-in rather than throwing it away.
//
// THE CITY RULE, ENFORCED HERE TOO
// The shelf, the product page and the checkout all refuse produce from another
// city, because a 2 kg order cannot be trucked across a state. A basket
// outlives all three: fill it in Nashik, change your city to Pune, and every
// row in it is now undeliverable. Rather than let the shopper discover that at
// the last gate, rows from other cities are dropped the moment the city
// changes — a basket you cannot check out is worse than an empty one.
// =============================================================================

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import type { Listing, QualityGrade, Unit } from '../types';

export interface CartItem {
  listingId: string;
  quantity: number;
  // --- snapshot, for first paint only. Live values come from cartLines.ts ---
  cropName: string;
  cropVariety: string | null;
  image: string | null;
  unit: Unit;
  pricePerUnit: number;
  currency: string;
  /** listing.location — the city the produce ships from, and the city rule's input. */
  city: string;
  farmerName: string | null;
  qualityGrade: QualityGrade;
  organic: boolean;
}

interface CartContextType {
  items: CartItem[];
  /** Number of distinct lots in the basket — not a weight. */
  count: number;
  /** Sum of the snapshot line totals. Good enough for the bar; the bill uses live prices. */
  snapshotTotal: number;
  currency: string;
  quantityOf: (listingId: string) => number;
  add: (listing: Listing, quantity: number) => void;
  setQuantity: (listingId: string, quantity: number) => void;
  remove: (listingId: string) => void;
  clear: () => void;
  /** Drops a set of lots in one write — used after checkout places their orders. */
  removeMany: (listingIds: string[]) => void;
}

const CartContext = createContext<CartContextType | null>(null);

// Versioned so a shape change can be ignored rather than crash on old JSON.
const KEY_PREFIX = 'cb_cart_v1';
const storageKey = (userId: string) => `${KEY_PREFIX}:${userId}`;

function readStored(userId: string): CartItem[] {
  // Read during render (see CartProvider), so it has to survive the prerender
  // build, where there is no localStorage at all.
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A row without an id or a positive quantity can't be rendered or ordered,
    // so drop it here rather than defend against it in five components.
    return parsed.filter((it: any) => it && typeof it.listingId === 'string' && Number(it.quantity) > 0);
  } catch {
    return [];
  }
}

function writeStored(userId: string, items: CartItem[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
    // A full or blocked localStorage must not break shopping — the basket just
    // becomes session-only.
  }
}

// One shared empty array rather than a fresh `[]` per render: it is the value
// `items` takes for the single render before a new account's basket is read in,
// and a new array each time would invalidate every memo hanging off it.
const NO_ITEMS: CartItem[] = [];

// Quantities are stepped in fractions (0.05 quintal, 0.005 tonne) and then
// multiplied by a price, so every arithmetic result is rounded before it is
// stored or sent. Same rule as QuantityStepper, for the same float dust.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// The basket, tagged with the account and the city it belongs to. Keeping all
// three in ONE piece of state is what lets the provider re-derive rather than
// react: "who is looking, and where do they live" fully determines which rows
// are valid, so a mismatch is corrected in the same render that noticed it
// (see CartProvider) instead of in an effect that fires after the wrong basket
// has already painted.
interface CartStore {
  userId: string;
  /** Lower-cased, because every comparison against listing.location is. */
  city: string;
  items: CartItem[];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const city = (user?.location?.trim() ?? '').toLowerCase();

  // Starts empty: the prerender build (entry-server.tsx) runs this tree with no
  // localStorage and no user, and an empty basket is the right answer there.
  const [store, setStore] = useState<CartStore>({ userId: '', city: '', items: [] });

  // Adjusting state during render, React's own pattern for state derived from
  // something above it. A `useEffect` here would paint one frame of the
  // previous account's basket — or of produce from the city the shopper just
  // left — before correcting itself, and the lint rule that forbids
  // synchronous setState in an effect is pointing at exactly that.
  if (store.userId !== userId || store.city !== city) {
    setStore((prev) => {
      // A different account replaces the basket wholesale; the same account
      // moving city keeps whatever still ships from where they now are.
      const base = prev.userId === userId ? prev.items : userId ? readStored(userId) : [];
      const items = city ? base.filter((it) => it.city.toLowerCase() === city) : base;
      return { userId, city, items };
    });
  }

  // React throws away the render that triggered the adjustment above, so this
  // value is never committed while the tags disagree — but it is read during
  // that render, and an empty basket is the only honest answer to "whose
  // basket, from where?" before the question has been re-settled.
  const items = store.userId === userId && store.city === city ? store.items : NO_ITEMS;

  // Signing out leaves the stored basket alone rather than wiping it — it is
  // waiting on the next sign-in. Nothing is written for a signed-out visitor,
  // which is also why the empty initial state can never overwrite a real one.
  useEffect(() => {
    if (!store.userId) return;
    writeStored(store.userId, store.items);
  }, [store]);

  const setItems = useCallback(
    (update: (prev: CartItem[]) => CartItem[]) =>
      setStore((prev) => ({ ...prev, items: update(prev.items) })),
    [],
  );

  const add = useCallback((listing: Listing, quantity: number) => {
    const price = listing.retailPricePerUnit;
    if (price == null || quantity <= 0) return;

    setItems((prev) => {
      const existing = prev.find((it) => it.listingId === listing.id);
      // Adding a lot that is already in the basket REPLACES the quantity rather
      // than adding to it. Every caller (the shelf stepper, the product page)
      // shows the shopper the number they are setting, so summing would move
      // the basket to a number nobody chose.
      const next: CartItem = {
        listingId: listing.id,
        quantity: round(quantity),
        cropName: listing.cropName,
        cropVariety: listing.cropVariety,
        image: listing.images[0] ?? null,
        unit: listing.unit,
        pricePerUnit: price,
        currency: listing.currency,
        city: listing.location,
        farmerName: listing.farmer?.user?.name ?? null,
        qualityGrade: listing.qualityGrade,
        organic: listing.organic,
      };
      return existing
        ? prev.map((it) => (it.listingId === listing.id ? next : it))
        : [...prev, next];
    });
  }, [setItems]);

  const setQuantity = useCallback((listingId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((it) => it.listingId !== listingId)
        : prev.map((it) => (it.listingId === listingId ? { ...it, quantity: round(quantity) } : it)),
    );
  }, [setItems]);

  const remove = useCallback((listingId: string) => {
    setItems((prev) => prev.filter((it) => it.listingId !== listingId));
  }, [setItems]);

  const removeMany = useCallback((listingIds: string[]) => {
    const gone = new Set(listingIds);
    setItems((prev) => prev.filter((it) => !gone.has(it.listingId)));
  }, [setItems]);

  const clear = useCallback(() => setItems(() => []), [setItems]);

  const quantityOf = useCallback(
    (listingId: string) => items.find((it) => it.listingId === listingId)?.quantity ?? 0,
    [items],
  );

  const value = useMemo<CartContextType>(() => ({
    items,
    count: items.length,
    snapshotTotal: items.reduce((sum, it) => sum + it.pricePerUnit * it.quantity, 0),
    // Every listing on one shelf is priced in the same currency, so the first
    // row's is the basket's. INR is the fallback for an empty basket.
    currency: items[0]?.currency ?? 'INR',
    quantityOf,
    add,
    setQuantity,
    remove,
    removeMany,
    clear,
  }), [items, quantityOf, add, setQuantity, remove, removeMany, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
