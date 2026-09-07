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
  farmer?: { user?: Pick<User, 'id' | 'name' | 'trustScore' | 'avatar'> };
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
export type PaymentStatus = 'AWAITING_PAYMENT' | 'ESCROW' | 'RELEASED' | 'REFUNDED';
export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED';

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
  createdAt: string;
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
