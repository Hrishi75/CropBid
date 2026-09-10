// =============================================================================
// CartContext — the basket, in kilograms
// =============================================================================
// Groceries are a multi-item habit. Someone buying two kilos of tomatoes is
// very likely buying onions and coriander too, so the basket lives above the
// navigator and every shelf only adds to it.
//
// THE CART STORES KILOGRAMS, NOT THE SELLER'S UNIT. This is the single most
// important rule here and it is a correctness one, not a preference. Half a
// kilo of a quintal-denominated lot is 0.005 quintal; rounded to 2dp that
// becomes 0.01 and the shopper is billed for double. Kilograms are what the
// shopper picked and what every screen shows, and the conversion back to the
// seller's denomination happens in exactly ONE place, at checkout, at 6dp,
// against the LIVE listing unit.
//
// WHAT IS STORED IS A SNAPSHOT, AND IT IS NOT THE TRUTH. Each row keeps a copy
// of the listing as it looked when it went in, so the cart tab paints instantly
// without refetching. A basket outlives that copy: a lot can sell out, be
// re-priced or be pulled from retail while it sits there. lib/cartLines re-
// prices every row against the live listing and the bill comes off THAT.
//
// PERSISTENCE IS PER-ACCOUNT. The storage key carries the user id, so a shared
// phone never shows one shopper another's basket, and signing out sets the
// basket aside rather than throwing it away.
//
// THE CITY RULE IS ENFORCED HERE TOO. A 2 kg order cannot be trucked across a
// state. Fill a basket in Nagpur, switch to Pune, and every row is now
// undeliverable, so rows from other cities are dropped the moment the city
// changes. A basket that cannot be checked out is worse than an empty one.
// =============================================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './AuthContext';
import { mintPurchaseKey } from '../lib/idempotency';
import { toKg } from '../lib/units';
import type { Listing, SellerType, Unit } from '../api/types';

export interface CartItem {
  listingId: string;
  /** KILOGRAMS. Never the seller's unit. See the header. */
  quantity: number;
  purchaseKey: string;
  // --- snapshot, for first paint only ---
  cropName: string;
  cropVariety: string | null;
  image: string | null;
  unit: Unit;
  pricePerUnit: number;
  currency: string;
  /** listing.location, and the city rule's input. */
  city: string;
  shopId: string | null;
  shopName: string | null;
  sellerType: SellerType | null;
}

interface CartValue {
  items: CartItem[];
  /** Distinct lines, not total weight. It is a tab badge. */
  count: number;
  ready: boolean;
  add: (listing: Listing, kg: number) => void;
  setQuantity: (listingId: string, kg: number) => void;
  remove: (listingId: string) => void;
  removeMany: (listingIds: string[]) => void;
  clear: () => void;
  quantityOf: (listingId: string) => number;
  /** Drops rows from other cities. Called when the delivery city changes. */
  keepOnlyCity: (city: string) => void;
}

const CartContext = createContext<CartValue | null>(null);

/** Smallest sellable amount, and the step every +/- moves by. */
export const STEP_KG = 0.5;

const KEY_PREFIX = 'cropbid.daily.cart.';
// A signed-out shopper still gets a basket; it is adopted on sign-in.
const GUEST = 'guest';

async function readStore(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

async function writeStore(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode */ }
    return;
  }
  try { await SecureStore.setItemAsync(key, value); } catch { /* quota or locked keystore */ }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  const storageKey = `${KEY_PREFIX}${user?.id ?? GUEST}`;

  // Which account the basket CURRENTLY IN STATE belongs to.
  //
  // A ref rather than state, because the persist effect has to read it in the
  // same commit it is written, and a state update would not have applied yet.
  // That is the whole bug this guards: see below.
  const loadedFor = useRef<string | null>(null);

  // Load this account's basket whenever the account changes.
  useEffect(() => {
    let cancelled = false;
    setReady(false);

    (async () => {
      const raw = await readStore(storageKey);
      if (cancelled) return;
      try {
        setItems(raw ? (JSON.parse(raw) as CartItem[]) : []);
      } catch {
        // Corrupt or from an older shape. An empty basket is recoverable; a
        // crash on launch is not.
        setItems([]);
      } finally {
        if (!cancelled) {
          loadedFor.current = storageKey;
          setReady(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [storageKey]);

  // Persist, but ONLY once the basket in state is known to belong to the key
  // being written to.
  //
  // Both effects depend on storageKey, so a sign-in or sign-out re-runs them in
  // the same commit. setReady(false) above does not help: it is a state update,
  // so it has not applied yet, and this effect would still see ready === true
  // alongside the PREVIOUS account's items and write them to the NEW account's
  // key, before that key has been read. Signing out then overwrote the guest
  // basket with the account's, and signing in did the reverse. Whichever was
  // emptier won, silently.
  useEffect(() => {
    if (!ready || loadedFor.current !== storageKey) return;
    void writeStore(storageKey, JSON.stringify(items));
  }, [items, ready, storageKey]);

  const add = useCallback((listing: Listing, kg: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.listingId === listing.id);
      if (existing) {
        return prev.map((i) =>
          i.listingId === listing.id
            // Re-minted: a different amount is a different purchase.
            ? { ...i, quantity: i.quantity + kg, purchaseKey: mintPurchaseKey() }
            : i,
        );
      }
      return [
        ...prev,
        {
          listingId: listing.id,
          quantity: kg,
          purchaseKey: mintPurchaseKey(),
          cropName: listing.cropName,
          cropVariety: listing.cropVariety,
          image: listing.images[0] ?? null,
          unit: listing.unit,
          pricePerUnit: listing.retailPricePerUnit ?? 0,
          currency: listing.currency,
          city: listing.location,
          shopId: listing.farmer?.id ?? null,
          shopName: listing.farmer?.businessName ?? listing.farmer?.user?.name ?? null,
          sellerType: listing.farmer?.sellerType ?? null,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((listingId: string, kg: number) => {
    setItems((prev) =>
      kg < STEP_KG
        // Below the floor is a removal, not a zero-weight line.
        ? prev.filter((i) => i.listingId !== listingId)
        : prev.map((i) =>
            i.listingId === listingId ? { ...i, quantity: kg, purchaseKey: mintPurchaseKey() } : i,
          ),
    );
  }, []);

  const remove = useCallback((listingId: string) => {
    setItems((prev) => prev.filter((i) => i.listingId !== listingId));
  }, []);

  const removeMany = useCallback((listingIds: string[]) => {
    const gone = new Set(listingIds);
    setItems((prev) => prev.filter((i) => !gone.has(i.listingId)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const quantityOf = useCallback(
    (listingId: string) => items.find((i) => i.listingId === listingId)?.quantity ?? 0,
    [items],
  );

  const keepOnlyCity = useCallback((city: string) => {
    const wanted = city.trim().toLowerCase();
    setItems((prev) => prev.filter((i) => i.city.trim().toLowerCase() === wanted));
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      items,
      count: items.length,
      ready,
      add,
      setQuantity,
      remove,
      removeMany,
      clear,
      quantityOf,
      keepOnlyCity,
    }),
    [items, ready, add, setQuantity, remove, removeMany, clear, quantityOf, keepOnlyCity],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}

/** Stock a lot has left, in kilograms. */
export function stockKg(listing: Listing): number {
  return toKg(listing.remainingQuantity, listing.unit);
}
