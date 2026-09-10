// =============================================================================
// Endpoints — the shop-first three
// =============================================================================
// The whole of Daily's read surface, and every one of them already exists on
// the server. Nothing here is new API: `browse.routes.ts` has shipped
// /browse/cities, /browse/shops and /browse/shops/:id for a while, and the
// business app simply never called them.
//
// EVERY CALL CARRIES A CITY. The server refuses a shop lookup without one
// (getRetailShop returns null on an empty city) because a shop's stock is
// deliverable from where the STOCK sits, not from where the owner's profile
// says they are. An order a shopper cannot receive is worse than an empty shop.
// =============================================================================

import api from './client';
import type { RetailCity, RetailShop, RetailShopDetail } from './types';

/** Cities with live direct-sale stock. Pune and Nagpur today. */
export async function retailCities(): Promise<RetailCity[]> {
  const { data } = await api.get<RetailCity[]>('/browse/cities');
  return data;
}

/** How the server decided which shops to show. */
export type LocatedBy = 'coordinates' | 'city';

export interface RetailShopsResult {
  shops: RetailShop[];
  /**
   * 'coordinates' means the list was narrowed to shops that can actually reach
   * the shopper; 'city' means it is every shop in the city, unfiltered.
   *
   * The screen needs these apart, because "no shop delivers to you yet" and
   * "no shop in this city has stock" are different sentences and a shopper
   * does different things about each.
   */
  locatedBy: LocatedBy;
}

/**
 * The city's shops.
 *
 * Passing a position narrows the Quick lane to shops within their own delivery
 * radius. Farms are unaffected: Fresh is a van route out of the mandi, not a
 * boy on a bicycle, so a shop-sized radius does not apply to it.
 */
export async function retailShops(
  city: string,
  position?: { latitude: number; longitude: number } | null,
): Promise<RetailShopsResult> {
  const { data } = await api.get<RetailShopsResult>('/browse/shops', {
    params: {
      city,
      ...(position ? { lat: position.latitude, lng: position.longitude } : {}),
    },
  });
  return data;
}

/**
 * One shop's whole counter.
 *
 * Returns null when the shop has nothing on the shelf in this city. That is the
 * server's rule, not a client convenience: a shop you cannot buy from reads the
 * same as one that does not exist, so the screen shows "not found" rather than
 * an empty shelf with a name above it.
 */
export async function retailShop(id: string, city: string): Promise<RetailShopDetail> {
  const { data } = await api.get<RetailShopDetail>(`/browse/shops/${id}`, {
    params: { city },
  });
  return data;
}

// -----------------------------------------------------------------------------
// Account
// -----------------------------------------------------------------------------
// Phone plus a six-digit code, which is the primary lane on the web too.
// Passwords exist on the API but Daily does not offer them: a household
// shopper signing up for groceries should not be asked to invent one.

import type { Listing, Order, PhoneChallenge, User } from './types';
import { setAccessToken, setRefreshToken } from './client';

export async function startPhoneSignIn(phone: string, email?: string): Promise<PhoneChallenge> {
  const { data } = await api.post<{ challenge: PhoneChallenge }>('/auth/phone/start', {
    phone,
    // Daily only ever creates shoppers. Selling is applied for from the
    // business app, and an account minted here must not arrive as a partner.
    intendedRole: 'CONSUMER',
    ...(email ? { email } : {}),
  });
  return data.challenge;
}

/** `name` is read only when the code creates a new account. */
export async function verifyPhoneSignIn(
  challengeId: string,
  code: string,
  name?: string,
): Promise<User> {
  const { data } = await api.post<{ user: User; accessToken: string; refreshToken?: string }>(
    '/auth/phone/verify',
    { challengeId, code, ...(name ? { name } : {}) },
  );
  setAccessToken(data.accessToken);
  if (data.refreshToken) await setRefreshToken(data.refreshToken);
  return data.user;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}

export async function updateMe(patch: { name?: string; location?: string }): Promise<User> {
  const { data } = await api.patch<{ user: User }>('/auth/me', patch);
  return data.user;
}

export async function signOut(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    // Local state is cleared even if the server call fails: a shopper who taps
    // sign out must end up signed out on this device regardless.
    setAccessToken(null);
    await setRefreshToken(null);
  }
}

// -----------------------------------------------------------------------------
// Buying
// -----------------------------------------------------------------------------

/** One lot, live. The cart re-prices every row against this before billing. */
export async function fetchListing(id: string): Promise<Listing> {
  const { data } = await api.get<Listing>(`/listings/${id}`);
  return data;
}

export interface DirectPurchaseInput {
  listingId: string;
  /** In the LISTING's own unit, converted from kilograms at the call site. */
  quantity: number;
  /** The unit that conversion used, so the server can refuse a mismatch. */
  unit: string;
  deliveryAddress: string;
  contactPhone: string;
  /** Minted per line, so a retry replays the purchase rather than doubling it. */
  idempotencyKey: string;
}

export async function directPurchase(input: DirectPurchaseInput): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>('/bids/direct-purchase', input);
  return data;
}

/** The shopper's own orders, newest first. */
export async function myOrders(): Promise<Order[]> {
  const { data } = await api.get<Order[] | { transactions: Order[] }>('/transactions');
  return Array.isArray(data) ? data : (data.transactions ?? []);
}

// -----------------------------------------------------------------------------
// Coverage
// -----------------------------------------------------------------------------

export interface Serviceability {
  /** A neighbourhood shop can reach this point today. */
  quick: boolean;
  /** The morning mandi run reaches it. */
  fresh: boolean;
  /** The city whose stock is closest, so the app can offer to switch to it. */
  nearestCity: string | null;
  /** How far that city's nearest stock is, in km. */
  nearestKm: number | null;
}

/**
 * Can we reach this point, and on which lane.
 *
 * The answer is rarely a plain yes or no. Somebody in Hingna has no shop within
 * reach but the morning van does get to them, and telling them "we do not
 * deliver here" would be false as well as discouraging.
 */
export async function serviceability(lat: number, lng: number): Promise<Serviceability> {
  const { data } = await api.get<Serviceability>('/browse/serviceability', {
    params: { lat, lng },
  });
  return data;
}

/**
 * "Come to my area."
 *
 * The most useful signal the product gets: somebody wanted to buy and could
 * not. Public and unauthenticated, because putting a sign-up in front of it
 * would lose exactly the people it exists to count.
 */
export async function requestCoverage(input: {
  latitude: number;
  longitude: number;
  areaLabel?: string;
  phone?: string;
}): Promise<void> {
  await api.post('/browse/coverage-request', input);
}
