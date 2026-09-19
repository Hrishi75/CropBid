// Subset of the API shapes the mobile app consumes.
// Mirrors client/src/types/index.ts — only the fields the app reads.

export type Role = 'FARMER' | 'BUYER' | 'CONSUMER' | 'ADMIN';
export type Unit = 'KG' | 'QUINTAL' | 'TONNE';
export type QualityGrade = 'A' | 'B' | 'C';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';
export type ListingStatus = 'ACTIVE' | 'IN_AUCTION' | 'SOLD' | 'EXPIRED';
// Where a seller's or buyer's application sits in review. Mirrors the
// PartnerStatus enum in server/prisma/schema.prisma.
export type PartnerStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_INFO'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  location?: string | null;
  country: string;
  currency: string;
  avatar?: string | null;
  trustScore: number;
  farmerProfile?: {
    // WHAT KIND OF SELLER THIS IS. The model is called FarmerProfile for
    // historical reasons and holds all three kinds; `sellerType` is the column
    // that says which (CLAUDE.md §4: read it as a SELLER profile). The server
    // has always sent these — `farmerProfile: true` selects every column — and
    // this type simply never named them, so the app collapsed a kirana store
    // into "farmer" everywhere it showed a label.
    sellerType?: SellerType;
    /** What a shop trades as. A FARMER has none and is known by their own name. */
    businessName?: string | null;
    /** "vegetable", "kirana", "general", ... Only a shop has one. */
    shopType?: string | null;
    farmSizeAcres?: number;
    state?: string;
    cropsGrown?: string[];
    organicCertified?: boolean;
    // The partner application's lifecycle. A profile exists from the moment the
    // application is filed, so its presence means "applied", not "approved" —
    // only `status` says that. See lib/partner.ts.
    status?: PartnerStatus;
    statusNote?: string | null;
  } | null;
  buyerProfile?: {
    companyName?: string;
    companyType?: string;
    status?: PartnerStatus;
    statusNote?: string | null;
  } | null;
}

export interface Listing {
  id: string;
  farmerId: string;
  // `sellerType` decides which lane a lot belongs to: a LOCAL_SHOP holds stock
  // and delivers today, everyone else is the next-morning mandi run. The server
  // has always sent it (PUBLIC_SELLER_SELECT); this type just never named it.
  farmer?: {
    sellerType?: SellerType;
    businessName?: string | null;
    shopType?: string | null;
    user?: Pick<User, 'id' | 'name' | 'trustScore' | 'avatar'>;
  };
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  remainingQuantity: number;
  unit: Unit;
  qualityGrade: QualityGrade;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency: string;
  directSaleEnabled: boolean;
  retailPricePerUnit: number | null;
  description: string | null;
  images: string[];
  organic: boolean;
  location: string;
  state: string;
  country: string;
  status: ListingStatus;
  harvestDate?: string | null;
  createdAt: string;
  matchScore?: number;
  _count?: { bids: number };
}

// --- The demand board (the reverse marketplace) -----------------------------
// A requirement is a buyer saying "I need this, at this price, by this date";
// farmers fill it outright or counter with their own price. Mirrors the shapes
// in client/src/types/index.ts, trimmed to the fields the app reads.

export type RequirementStatus = 'OPEN' | 'FULFILLED' | 'CLOSED' | 'EXPIRED';
export type RequirementOfferStatus =
  | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
/** INSTANT filled at the buyer's own price; COUNTER proposed the farmer's. */
export type RequirementOfferKind = 'INSTANT' | 'COUNTER';

// The counterparty-safe buyer shape the API returns on a requirement: company
// details only, never taxId, procurement volume, phone or email. It is absent
// entirely when the reader is another BUYER — the server redacts competitor
// identity, so treat a missing buyer as normal, not as an error.
export interface RequirementBuyer {
  id: string;
  name: string;
  trustScore: number;
  avatar: string | null;
  buyerProfile?: {
    companyName?: string | null;
    companyType?: string | null;
    country?: string;
    verified?: boolean;
  } | null;
}

export interface RequirementOfferFarmer {
  id: string;
  name: string;
  trustScore: number;
  avatar: string | null;
  farmerProfile?: { state?: string | null; organicCertified?: boolean; verified?: boolean } | null;
}

export interface BuyerRequirement {
  id: string;
  buyerId: string;
  buyer?: RequirementBuyer;
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  /** What is still unfilled. A requirement can be filled in pieces. */
  remainingQuantity: number;
  unit: Unit;
  qualityGrade: QualityGrade;
  pricePerUnit: number;
  currency: string;
  deliveryLocation: string;
  deliveryState: string;
  deliveryCountry?: string;
  neededBy: string | null;
  description: string | null;
  organic: boolean;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  status: RequirementStatus;
  createdAt: string;
  updatedAt?: string;
  offers?: RequirementOffer[];
  // On the feed this counts ALL offers; on /my it counts only PENDING ones,
  // because that is the number the buyer has to act on.
  _count?: { offers: number };
}

export interface RequirementOffer {
  id: string;
  requirementId: string;
  requirement?: BuyerRequirement;
  farmerId: string;
  farmer?: RequirementOfferFarmer;
  kind: RequirementOfferKind;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  currency: string;
  message: string | null;
  status: RequirementOfferStatus;
  listingId: string | null;
  bidId: string | null;
  createdAt: string;
  respondedAt: string | null;
}

/** What the feed can actually be narrowed by, as the server reports it. */
export interface RequirementFilterOptions {
  crops?: string[];
  states?: string[];
  buyerTypes?: string[];
}

export interface Bid {
  id: string;
  listingId: string;
  listing?: Listing;
  buyerId: string;
  buyer?: { id?: string; name: string; trustScore?: number; phone?: string | null; location?: string | null };
  bidPricePerUnit: number;
  totalAmount: number;
  quantity: number;
  currency: string;
  message: string | null;
  // Order fulfilment details — where to deliver and whom to call
  deliveryAddress?: string | null;
  contactPhone?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  status: BidStatus;
  counterPrice: number | null;
  isAgentBid?: boolean;
  isDirectPurchase?: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  listings: T[];
  pagination: { page: number; total: number; totalPages: number; hasMore: boolean };
}

// --- Transactions ---
export type PaymentStatus = 'AWAITING_PAYMENT' | 'ESCROW' | 'RELEASED' | 'REFUNDED' | 'CANCELLED';
// CANCELLED: called off before dispatch. A paid order that is called off goes
// to REFUNDED on the payment side instead, since money has to come back.
export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED' | 'CANCELLED';

export interface Transaction {
  id: string;
  listingId: string;
  listing?: Listing;
  bidId: string;
  bid?: Bid;
  farmerId: string;
  farmer?: { id: string; name: string; trustScore: number };
  buyerId: string;
  buyer?: { id: string; name: string; trustScore: number };
  finalPricePerUnit: number;
  totalAmount: number;
  currency: string;
  platformFeePercent: number;
  platformFeeAmount: number;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  // Retail only: the shop order this lot was bought in, which is what the
  // shopper pays for. Null for trade deals and for retail orders placed
  // before shop orders existed.
  retailOrder?: RetailOrderSummary | null;
  createdAt: string;
}

export interface RetailOrderSummary {
  id: string;
  itemsTotal: number;
  /** Charged once per shop order under the free-delivery threshold. Kept by CropBid. */
  deliveryFee: number;
  /** itemsTotal + deliveryFee: the one amount the shopper pays. */
  totalAmount: number;
  currency: string;
  paidAt: string | null;
  /** Set when the order was called off before the shop sent it. */
  cancelledAt: string | null;
  /** Who called it off: compare with your own id to say "you cancelled this". */
  cancelledById: string | null;
  cancelReason: string | null;
  _count: { transactions: number };
}

/** What POST /retail-orders answers with: one shop's order, lots included. */
export interface RetailOrder {
  id: string;
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  currency: string;
  transactions: { id: string; bidId: string; listingId: string; totalAmount: number }[];
}

/** GET /browse/retail-rules: the numbers the basket has to agree with the server on. */
export interface RetailRules {
  freeDeliveryFrom: number;
  deliveryFee: number;
  currency: string;
}

export interface TransactionStats {
  total: number;
  inEscrow: number;
  released: number;
  refunded: number;
  totalRevenue: number;
}

// --- AI agent ---
export type NegotiationStyle = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
export type NegotiationOutcome = 'IN_PROGRESS' | 'DEAL' | 'NO_DEAL';

export interface AgentConfig {
  id: string;
  userId: string;
  agentType: 'FARMER_AGENT' | 'BUYER_AGENT';
  autoNegotiate: boolean;
  active: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  preferredCrops: string[];
  maxDistanceKm: number | null;
  autoAcceptThreshold: number | null;
  negotiationStyle: NegotiationStyle;
}

export interface Negotiation {
  id: string;
  listingId: string;
  listing?: Listing & { farmer?: { user?: { id: string; name: string } } };
  bidId: string;
  bid?: Bid & { buyer?: { id: string; name: string; trustScore: number } };
  rounds: Array<Record<string, unknown>>;
  finalOutcome: NegotiationOutcome;
  startedAt: string;
  endedAt: string | null;
}

// --- Notifications ---
// Mirrors the Notification model (server prisma schema). `type` is one of
// NEW_BID, BID_ACCEPTED, BID_REJECTED, BID_COUNTERED, NEGOTIATION_DONE,
// AUCTION_WON, DELIVERY_UPDATE, PAYMENT_RELEASED, SHIPMENT_BOOKED, SHIPMENT_UPDATE.
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, unknown> | null;
  createdAt: string;
}

// --- Live auctions ---
export interface AuctionBid {
  userId: string;
  userName: string;
  price: number;
  timestamp: string;
}

export interface Auction {
  listingId: string;
  cropName: string;
  unit: Unit;
  currency: string;
  startPrice: number;
  currentPrice: number;
  currentWinner: string | null; // winner display name
  bidCount: number;
  participantCount: number;
  bids: AuctionBid[];
  endsAt: string;
  farmerId: string;
}

// -----------------------------------------------------------------------------
// Wallet — prepaid credits
// -----------------------------------------------------------------------------
// 1 credit is 1 rupee. No exchange rate, no bonus, no expiry: see
// server/src/services/wallet.service for why inventing one would be a pricing
// decision made in the wrong place.

/** A saved delivery address. See server/prisma Address for why `line` is free text. */
export interface Address {
  id: string;
  label: string;
  line: string;
  city: string;
  phone: string | null;
  landmark: string | null;
  /** Exactly one of a shopper's addresses is true. The server holds that. */
  isDefault: boolean;
  createdAt: string;
}

export interface AddressInput {
  label: string;
  line: string;
  city: string;
  phone?: string | null;
  landmark?: string | null;
  isDefault?: boolean;
}

export type SellerType = 'FARMER' | 'LOCAL_SHOP' | 'WHOLESALER';

/** A city that actually has direct-sale stock. */
export interface RetailCity {
  city: string;
  state: string;
}

/**
 * One seller as it appears in the city's shop list.
 *
 * Only sellers HOLDING LIVE RETAIL STOCK come back from /browse/shops, so a
 * shop that has onboarded but listed nothing does not appear, and one that
 * sells out drops off on its own. That is the behaviour rather than a filter
 * the app has to remember to apply.
 *
 * `fromPricePerKg` is the cheapest thing on the shelf, already normalised to
 * kilograms by the server. It is a "from" price, so a card must label it as
 * one: shown bare it reads as the price of whatever is pictured.
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
  fromPricePerKg: number | null;
  image: string | null;
  lastRestockedAt: string;
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

export type WalletEntryType = 'TOPUP' | 'SPEND' | 'REFUND' | 'ADJUSTMENT';

export interface Wallet {
  balance: number;
  currency: string;
  /**
   * Whether credits can pay for an order yet.
   *
   * Served by the API rather than hardcoded here, so the day checkout learns to
   * spend credits the app stops saying otherwise without a release. False
   * today: `spend()` exists on the server and nothing calls it.
   */
  canSpend: boolean;
  limits: { min: number; max: number };
}

/** One movement of credits. Signed: positive adds, negative removes. */
export interface WalletEntry {
  id: string;
  type: WalletEntryType;
  amount: number;
  /** The running total straight after this entry, so a statement row is readable on its own. */
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface WalletTopupOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}
