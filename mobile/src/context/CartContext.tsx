// =============================================================================
// CartContext — the shopper's basket, on the phone
// =============================================================================
// Retail is a multi-item habit. Someone buying two kilos of tomatoes is very
// likely also buying onions and a litre of milk, and sending them through the
// one-lot buy bar three times means three orders placed one at a time with no
// running total in between. So the basket lives here, above the navigator, and
// the shelf and the listing screen only add to it. Same model as the web cart
// (client/src/context/CartContext.tsx) — deliberately, so a shopper who starts
// on the site and finishes on the app meets the same rules.
//
// WHAT IS STORED, AND WHY IT IS A SNAPSHOT
// Each row keeps the listing's id AND a copy of what it looked like when it
// went in: name, price, unit, grower, and the household pack it was sold as.
// That copy exists so the cart tab and the bar paint instantly without
// refetching every listing first. It is NOT the truth about price or stock — a
// basket can sit for days while a lot sells out or the grower re-prices it. The
// cart and checkout screens re-price every line against the live listing (see
// lib/cartLines.ts) and bill off that; the snapshot is only ever a fast paint.
//
// WHY THE DISK COPY IS ONLY THREE FIELDS
// The web keeps the whole snapshot in localStorage. There is no localStorage
// here, and the app does not carry AsyncStorage — what it does have is
// expo-secure-store, whose Android backing store starts warning past ~2 KB per
// value. Ten full snapshots would sail past that, so what goes to disk is the
// id, the amount and the purchase key, and the snapshot is rebuilt from the API
// on the next launch. That costs one small burst of requests on a cold start
// with a basket in it, and it has a pleasant side effect: a lot that has since
// been deleted simply does not come back.
//
// PERSISTENCE IS PER-ACCOUNT
// The key carries the user id, so a shared phone never shows one shopper the
// other's basket, and signing out leaves the basket to be found on the next
// sign-in rather than throwing it away.
//
// THE CITY RULE, ENFORCED HERE TOO
// The shelf, the listing screen and the checkout all refuse produce from
// another city, because a 2 kg order cannot be trucked across a state. A basket
// outlives all three: fill it in Nashik, change your city to Pune, and every
// row in it is now undeliverable. Rather than let the shopper discover that at
// the last gate, rows from other cities are dropped the moment the city
// changes — a basket you cannot check out is worse than an empty one.
// =============================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';
import { fetchListing } from '../api/endpoints';
import { mintPurchaseKey } from '../lib/idempotency';
import { railFor, shopPack } from '../lib/catalog';
import type { Listing, QualityGrade, Unit } from '../api/types';

/** The household pack a lot was shelved as, frozen onto the row that bought it. */
export interface CartPack {
  label: string;  // "1 kg", "500 g"
  kg: number;     // pack size in kilograms
  units: number;  // pack size in the LISTING's own unit — what one tap of + adds
}

export interface CartItem {
  listingId: string;
  /** In the LISTING's own unit (kg / quintal / tonne) — what the order carries. */
  quantity: number;
  // --- snapshot, for first paint only. Live values come from lib/cartLines.ts ---
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
  /** null for a bulk-only crop (cotton, maize), which is stepped by the unit. */
  pack: CartPack | null;
  /**
   * Reference for the ONE purchase this line intends, sent to
   * /bids/direct-purchase so a retry after a lost response returns the order
   * that already exists instead of buying the lot twice.
   *
   * It lives on the line, and therefore on disk, on purpose: the case it exists
   * for is a response that never arrived, and the shopper's next move may well
   * be to kill the app and reopen it. A key held in component state would not
   * survive that, which is exactly when it is needed.
   *
   * Re-minted whenever the quantity changes, because a different quantity is a
   * different intent — replaying the old key would quietly buy the old amount.
   */
  purchaseKey: string;
}

interface CartContextType {
  items: CartItem[];
  /** Number of distinct lots in the basket — not a weight. */
  count: number;
  /** Sum of the snapshot line totals. Good enough for the bar; the bill uses live prices. */
  snapshotTotal: number;
  currency: string;
  /** False until the stored basket has been read back and re-priced. */
  hydrated: boolean;
  quantityOf: (listingId: string) => number;
  add: (listing: Listing, quantity: number) => void;
  setQuantity: (listingId: string, quantity: number) => void;
  remove: (listingId: string) => void;
  /** Drops a set of lots in one write — used after checkout places their orders. */
  removeMany: (listingIds: string[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

// Versioned so a shape change can be ignored rather than crash on old JSON.
// SecureStore keys are limited to letters, digits, '.', '-' and '_', which a
// cuid user id satisfies.
const KEY_PREFIX = 'cb_cart_v1_';
const storageKey = (userId: string) => `${KEY_PREFIX}${userId}`;

/** What actually goes to disk — see the note at the top of the file. */
interface StoredRow { i: string; q: number; k: string }

async function readStored(userId: string): Promise<StoredRow[]> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A row without an id or a positive quantity can't be rendered or ordered,
    // so drop it here rather than defend against it in five components.
    return parsed
      .filter((r: any) => r && typeof r.i === 'string' && Number(r.q) > 0)
      // A basket stored before purchase keys existed has none. Minting here
      // beats making every reader defend against a missing field, and a fresh
      // key is right: nothing has been ordered under the old line yet.
      .map((r: any) => ({ i: r.i, q: Number(r.q), k: typeof r.k === 'string' && r.k ? r.k : mintPurchaseKey() }));
  } catch {
    return [];
  }
}

async function writeStored(userId: string, items: CartItem[]): Promise<void> {
  const rows: StoredRow[] = items.map((it) => ({ i: it.listingId, q: it.quantity, k: it.purchaseKey }));
  try {
    if (rows.length === 0) {
      await SecureStore.deleteItemAsync(storageKey(userId));
      return;
    }
    await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(rows));
  } catch {
    // A blocked or full store must not break shopping — the basket just becomes
    // session-only.
  }
}

// Quantities are stepped in fractions (0.05 quintal, 0.005 tonne) and then
// multiplied by a price, so every arithmetic result is rounded before it is
// stored or sent. Same rule as QuantityStepper, for the same float dust.
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The pack a lot is shelved as, in the shape the row stores. */
function packOf(listing: Listing): CartPack | null {
  const pack = shopPack({
    crop: listing.cropName,
    cat: railFor(listing.cropName),
    unit: listing.unit,
    floor: listing.pricePerUnitMin,
    ceiling: listing.pricePerUnitMax,
    retail: listing.retailPricePerUnit,
  });
  return pack ? { label: pack.label, kg: pack.kg, units: pack.units } : null;
}

/** A basket row built from a live listing. Null when the lot is not buyable. */
function rowFrom(listing: Listing, quantity: number, purchaseKey: string): CartItem | null {
  const price = listing.retailPricePerUnit;
  if (price == null || quantity <= 0) return null;
  return {
    listingId: listing.id,
    quantity: round(quantity),
    cropName: listing.cropName,
    cropVariety: listing.cropVariety,
    image: listing.images?.[0] ?? null,
    unit: listing.unit,
    pricePerUnit: price,
    currency: listing.currency,
    city: listing.location,
    farmerName: listing.farmer?.user?.name ?? null,
    qualityGrade: listing.qualityGrade,
    organic: listing.organic,
    pack: packOf(listing),
    purchaseKey,
  };
}

// The basket, tagged with the account and the city it belongs to. Keeping all
// three in ONE piece of state is what lets a mismatch be corrected in the same
// render that noticed it, rather than in an effect that fires after the wrong
// basket has already painted.
interface CartStore {
  userId: string;
  /** Lower-cased, because every comparison against listing.location is. */
  city: string;
  items: CartItem[];
  /** False while the stored basket is still being read back. */
  hydrated: boolean;
}

const EMPTY: CartStore = { userId: '', city: '', items: [], hydrated: true };

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const city = (user?.location?.trim() ?? '').toLowerCase();

  const [store, setStore] = useState<CartStore>(EMPTY);

  // Adjusting state during render, React's own pattern for state derived from
  // something above it. An effect here would paint one frame of produce from
  // the city the shopper just left before correcting itself.
  //
  // Only the CITY is handled this way; the account is handled in the effect
  // below because reading the basket back is asynchronous.
  if (store.userId === userId && store.city !== city) {
    setStore((prev) => ({
      ...prev,
      city,
      items: city ? prev.items.filter((it) => it.city.toLowerCase() === city) : prev.items,
    }));
  }

  // Whose basket is this, and has it been read back yet? Signing in reads from
  // disk and re-prices; signing out just lets go of the rows — the stored copy
  // stays where it is, waiting for the next sign-in.
  useEffect(() => {
    if (!userId) { setStore(EMPTY); return; }

    let on = true;
    setStore((prev) => (prev.userId === userId ? prev : { userId, city, items: [], hydrated: false }));

    (async () => {
      const rows = await readStored(userId);
      if (!on) return;
      if (rows.length === 0) {
        setStore((prev) => (prev.userId === userId ? { ...prev, hydrated: true } : prev));
        return;
      }

      // allSettled, because one deleted lot must not blank out the other four.
      const results = await Promise.allSettled(rows.map((r) => fetchListing(r.i)));
      if (!on) return;
      const items = results
        .map((res, i) => (res.status === 'fulfilled' ? rowFrom(res.value, rows[i].q, rows[i].k) : null))
        .filter((it): it is CartItem => it !== null);

      setStore((prev) => {
        if (prev.userId !== userId) return prev;
        // prev.city, not the city captured when the effect ran: the shopper may
        // have moved between the two, and the render-time adjustment above has
        // already settled which city the basket belongs to.
        const fromDisk = prev.city
          ? items.filter((it) => it.city.toLowerCase() === prev.city)
          : items;
        // Anything added while the read-back was in flight wins. Replacing
        // wholesale would silently drop a lot the shopper watched go into the
        // basket a moment ago, which is the one thing a cart must never do.
        const added = new Set(prev.items.map((it) => it.listingId));
        return {
          ...prev,
          items: [...prev.items, ...fromDisk.filter((it) => !added.has(it.listingId))],
          hydrated: true,
        };
      });
    })();

    return () => { on = false; };
    // `city` is read once to tag a fresh store and is kept current by the
    // adjustment above; re-running this effect on it would refetch the basket
    // every time the shopper changed city.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Nothing is written for a signed-out visitor, and nothing is written before
  // the read-back lands — which is also why the empty initial state can never
  // overwrite a real basket.
  useEffect(() => {
    if (!store.userId || !store.hydrated) return;
    void writeStored(store.userId, store.items);
  }, [store]);

  const items = store.items;

  const setItems = useCallback(
    (update: (prev: CartItem[]) => CartItem[]) =>
      setStore((prev) => ({ ...prev, items: update(prev.items) })),
    [],
  );

  const add = useCallback((listing: Listing, quantity: number) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.listingId === listing.id);
      // The key tracks the INTENT, not the tap. Setting the same lot to the
      // same amount it already held changes nothing about what is being bought,
      // so the key has to survive it — that path is reached by pressing ADD
      // again after a purchase whose response went missing, which is precisely
      // when the replay has to work. Any other amount is a different order and
      // gets its own key.
      const keep = existing && existing.quantity === round(quantity);
      const next = rowFrom(listing, quantity, keep ? existing.purchaseKey : mintPurchaseKey());
      if (!next) return prev;
      // Adding a lot that is already in the basket REPLACES the quantity rather
      // than adding to it. Every caller (the shelf stepper, the listing screen)
      // shows the shopper the number they are setting, so summing would move
      // the basket to a number nobody chose.
      return existing
        ? prev.map((it) => (it.listingId === listing.id ? next : it))
        : [...prev, next];
    });
  }, [setItems]);

  const setQuantity = useCallback((listingId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((it) => it.listingId !== listingId)
        : prev.map((it) => {
            if (it.listingId !== listingId) return it;
            const next = round(quantity);
            if (next === it.quantity) return it;
            // Changing the amount changes what is being bought, so the old key
            // must not carry over: replaying it would return an order for the
            // previous quantity and look like the change never took.
            return { ...it, quantity: next, purchaseKey: mintPurchaseKey() };
          }),
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
    hydrated: store.hydrated,
    quantityOf,
    add,
    setQuantity,
    remove,
    removeMany,
    clear,
  }), [items, store.hydrated, quantityOf, add, setQuantity, remove, removeMany, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
