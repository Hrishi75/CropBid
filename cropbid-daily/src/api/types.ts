// =============================================================================
// API types — the shop-first shapes, and only those
// =============================================================================
// Daily talks to three endpoints and nothing else so far. It deliberately does
// NOT model bids, auctions, requirements or negotiations: a shopper never sees
// them, and carrying the types would invite a screen that uses them.
//
// These mirror the server's browse.service.ts return shapes. When that file
// changes, this one has to follow.
// =============================================================================

/** Denomination a seller lists in. Retail converts all of these to kilograms. */
export type Unit = 'KG' | 'QUINTAL' | 'TONNE';

export type SellerType = 'FARMER' | 'LOCAL_SHOP' | 'WHOLESALER';

export type QualityGrade = 'A' | 'B' | 'C';

/** A city that actually has direct-sale stock. Free text would return an empty shelf on a typo. */
export interface RetailCity {
  city: string;
  state: string;
}

/**
 * One shop as it appears in the city list.
 *
 * `fromPricePerKg` is the cheapest thing on the shelf, already converted to
 * kilograms by the server. It is a "from" price, so the card must label it as
 * one: showing it bare reads as the price of whatever is pictured.
 */
export interface RetailShop {
  id: string;
  name: string;
  sellerType: SellerType;
  shopType: string | null;
  city: string;
  state: string;
  verified: boolean;
  trustScore: number;
  itemCount: number;
  crops: string[];
  organicCount: number;
  currency: string;
  fromPricePerKg: number;
  image: string | null;
  lastRestockedAt: string;
  /** Kilometres from the shopper. Null when the position or the shop's is unknown. */
  distanceKm: number | null;
  /** How far this shop delivers. */
  radiusKm: number;
}

/**
 * The seller, as every public listing carries them (PUBLIC_SELLER_SELECT on the
 * server). Optional because /listings/:id is shared with the business app and
 * does not always include it; every caller here degrades to the shop name it
 * already had rather than assuming.
 */
export interface PublicSeller {
  id: string;
  sellerType: SellerType;
  businessName: string | null;
  shopType: string | null;
  verified: boolean;
  organicCertified: boolean;
  certificationBody: string | null;
  user?: { id: string; name: string; trustScore: number; avatar: string | null; location: string | null };
}

/** A single lot on a shop's shelf. */
export interface Listing {
  farmer?: PublicSeller;
  id: string;
  cropName: string;
  cropVariety: string | null;
  remainingQuantity: number;
  unit: Unit;
  qualityGrade: QualityGrade;
  retailPricePerUnit: number | null;
  currency: string;
  organic: boolean;
  images: string[];
  description: string | null;
  location: string;
  state: string;
  updatedAt: string;
}

/** The header of a shop page: who they are, not what they sell. */
export interface RetailShopHeader {
  id: string;
  name: string;
  sellerType: SellerType;
  shopType: string | null;
  city: string;
  state: string;
  verified: boolean;
  trustScore: number;
  organicCertified: boolean;
  certificationBody: string | null;
  itemCount: number;
}

export interface RetailShopDetail {
  shop: RetailShopHeader;
  listings: Listing[];
}

// -----------------------------------------------------------------------------
// Account and orders
// -----------------------------------------------------------------------------

/** Only what a shopper's own screens need. Daily never renders another user. */
export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'CONSUMER' | 'FARMER' | 'BUYER' | 'ADMIN';
  /** The shopper's delivery city. Doubles as the checkout default. */
  location: string | null;
  avatar: string | null;
  trustScore: number;
  createdAt: string;
}

/** What POST /auth/phone/start hands back, to be echoed to /verify. */
export interface PhoneChallenge {
  challengeId: string;
  phone: string;
  expiresAt: string;
  isNewAccount: boolean;
  channel: string;
  sentTo: string | null;
}

// Both mirror the server enums exactly (server/prisma/schema.prisma). Inventing
// a member here does not fail anywhere: the comparison simply never matches and
// the status quietly falls through to its default, which is how "Paid, packing"
// went missing while every order read "Placed".
export type PaymentStatus = 'AWAITING_PAYMENT' | 'ESCROW' | 'RELEASED' | 'REFUNDED';

export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED';

/**
 * One placed order.
 *
 * A basket of six items from three shops becomes SIX of these, because the
 * server settles one lot per transaction. The orders screen groups them back
 * together by the day they were placed rather than pretending otherwise.
 */
export interface Order {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  createdAt: string;
  /**
   * The AMOUNT lives here, not on the transaction.
   *
   * A transaction records the money and the delivery; the bid underneath it
   * records what was actually bought. Reading `quantity` off the transaction
   * gives undefined, and `toKg(undefined, unit)` renders "NaN kg" on the order
   * card rather than failing loudly.
   */
  bid: { quantity: number } | null;
  /**
   * The PERSON behind the seller, denormalised onto the transaction: id, name
   * and trust score only. Not the shop.
   *
   * The trading name lives on `listing.farmer.businessName`, because a shop
   * trades as its business and a farmer trades as themselves. Reading the name
   * off here labels "Ramji Sabji Bhandar" as "Ramji Patil".
   */
  farmer: { id: string; name: string; trustScore: number } | null;
  listing: {
    id: string;
    cropName: string;
    cropVariety: string | null;
    unit: Unit;
    images: string[];
    farmer?: PublicSeller;
  } | null;
}
