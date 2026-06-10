// Subset of the API shapes the mobile app consumes.
// Mirrors client/src/types/index.ts — only the fields the app reads.

export type Role = 'FARMER' | 'BUYER' | 'ADMIN';
export type Unit = 'KG' | 'QUINTAL' | 'TONNE';
export type QualityGrade = 'A' | 'B' | 'C';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';
export type ListingStatus = 'ACTIVE' | 'IN_AUCTION' | 'SOLD' | 'EXPIRED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  country: string;
  currency: string;
  trustScore: number;
  farmerProfile?: { state?: string; cropsGrown?: string[] } | null;
  buyerProfile?: { companyName?: string; companyType?: string } | null;
}

export interface Listing {
  id: string;
  farmerId: string;
  farmer?: { user?: Pick<User, 'id' | 'name' | 'trustScore'> };
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  unit: Unit;
  qualityGrade: QualityGrade;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency: string;
  description: string | null;
  images: string[];
  organic: boolean;
  location: string;
  state: string;
  country: string;
  status: ListingStatus;
  createdAt: string;
  matchScore?: number;
  _count?: { bids: number };
}

export interface Bid {
  id: string;
  listingId: string;
  listing?: Listing;
  buyerId: string;
  bidPricePerUnit: number;
  totalAmount: number;
  quantity: number;
  currency: string;
  message: string | null;
  status: BidStatus;
  counterPrice: number | null;
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
