// =============================================================================
// TypeScript Types — Mirrors the Prisma schema
// =============================================================================
// These types define the shape of data flowing between client and server.
// They match the Prisma models but only include fields the client sees
// (no password, no refreshToken).
// =============================================================================

// --- Enums ---
// CONSUMER is the retail tier: a household buying a kilo, not a company buying a
// lot. They instant-buy at a listing's fixed retail price and never bid,
// negotiate, or hold a company profile. See Role in prisma/schema.prisma.
export type Role = 'FARMER' | 'BUYER' | 'CONSUMER' | 'ADMIN';
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';
export type Language = 'EN' | 'HI' | 'MR';
export type Unit = 'KG' | 'QUINTAL' | 'TONNE';
export type QualityGrade = 'A' | 'B' | 'C';
export type ListingStatus = 'ACTIVE' | 'IN_AUCTION' | 'SOLD' | 'EXPIRED';
export type CompanyType = 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER';
export type AgentType = 'FARMER_AGENT' | 'BUYER_AGENT';
export type NegotiationStyle = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';
export type PaymentStatus = 'AWAITING_PAYMENT' | 'ESCROW' | 'RELEASED' | 'REFUNDED';
export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED';
export type NegotiationOutcome = 'DEAL' | 'NO_DEAL' | 'IN_PROGRESS';
export type RequirementStatus = 'OPEN' | 'FULFILLED' | 'CLOSED' | 'EXPIRED';
export type RequirementOfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
export type RequirementOfferKind = 'INSTANT' | 'COUNTER';

// --- Models ---
export interface User {
  id: string;
  name: string;
  email: string | null; // optional — phone is the primary contact
  role: Role;
  phone: string | null;
  location: string | null;
  country: string;
  currency: Currency;
  language: Language;
  avatar: string | null;
  trustScore: number;
  createdAt: string;
  updatedAt: string;
  farmerProfile?: FarmerProfile | null;
  buyerProfile?: BuyerProfile | null;
}

export interface FarmerProfile {
  id: string;
  userId: string;
  farmSizeAcres: number;
  cropsGrown: string[];
  country: string;
  state: string;
  fpoName: string | null;
  apmcLicense: string | null;
  organicCertified: boolean;
  certificationBody: string | null;
  bankDetails: any;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerProfile {
  id: string;
  userId: string;
  companyName: string;
  companyType: CompanyType;
  country: string;
  taxId: string | null;
  annualProcurementVolume: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  farmerId: string;
  farmer?: FarmerProfile & { user?: User };
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  // Stock left for direct sale — decremented on every consumer purchase. Equals
  // `quantity` on a listing that has never had a retail sale.
  remainingQuantity: number;
  unit: Unit;
  qualityGrade: QualityGrade;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency: Currency;
  // The retail channel, running alongside bidding. When directSaleEnabled is on,
  // a CONSUMER can instant-buy any quantity up to remainingQuantity at
  // retailPricePerUnit — no bid, no negotiation.
  directSaleEnabled: boolean;
  retailPricePerUnit: number | null;
  harvestDate: string | null;
  expiryDate: string | null;
  description: string | null;
  // Stored machine translations of `description`, written server-side after
  // the listing is saved. Any may be null — read them via
  // utils/localized.ts, which falls back to `description`.
  descriptionEn?: string | null;
  descriptionHi?: string | null;
  descriptionMr?: string | null;
  descriptionLang?: Language | null;
  images: string[];
  labReportUrl: string | null;
  organic: boolean;
  location: string;
  country: string;
  state: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  id: string;
  userId: string;
  agentType: AgentType;
  autoNegotiate: boolean;
  active: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  preferredCrops: string[];
  qualityRequirements: any;
  maxDistanceKm: number | null;
  autoAcceptThreshold: number | null;
  negotiationStyle: NegotiationStyle;
  createdAt: string;
  updatedAt: string;
}

export interface Bid {
  id: string;
  listingId: string;
  listing?: Listing;
  buyerId: string;
  buyer?: User;
  bidPricePerUnit: number;
  totalAmount: number;
  quantity: number;
  currency: Currency;
  message: string | null;
  // Order fulfilment details — where to deliver and whom to call
  deliveryAddress?: string | null;
  contactPhone?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  isAgentBid: boolean;
  status: BidStatus;
  counterPrice: number | null;
  createdAt: string;
  expiresAt: string | null;
}

// --- Buyer Requirements (the reverse marketplace) ---
// A buyer posts demand; farmers either fill it at the posted price (an INSTANT
// offer, which closes the deal immediately) or counter with their own price (a
// COUNTER offer the buyer accepts or rejects).

// The counterparty-safe buyer shape the API returns on requirements — company
// details only, never taxId, procurement volume, phone or email.
export interface RequirementBuyer {
  id: string;
  name: string;
  trustScore: number;
  avatar: string | null;
  buyerProfile?: Pick<BuyerProfile, 'companyName' | 'companyType' | 'country' | 'verified'> | null;
}

// The counterparty-safe farmer shape on offers. Rooted at User, not
// FarmerProfile, because RequirementOffer.farmerId targets User.
export interface RequirementOfferFarmer {
  id: string;
  name: string;
  trustScore: number;
  avatar: string | null;
  farmerProfile?: Pick<
    FarmerProfile,
    'state' | 'country' | 'organicCertified' | 'certificationBody' | 'verified'
  > | null;
}

export interface BuyerRequirement {
  id: string;
  buyerId: string;
  buyer?: RequirementBuyer;
  cropName: string;
  cropVariety: string | null;
  quantity: number;
  remainingQuantity: number;
  unit: Unit;
  qualityGrade: QualityGrade;
  pricePerUnit: number;
  currency: Currency;
  deliveryLocation: string;
  deliveryState: string;
  deliveryCountry: string;
  neededBy: string | null;
  description: string | null;
  // See the matching block on Listing.
  descriptionEn?: string | null;
  descriptionHi?: string | null;
  descriptionMr?: string | null;
  descriptionLang?: Language | null;
  organic: boolean;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  status: RequirementStatus;
  createdAt: string;
  updatedAt: string;
  offers?: RequirementOffer[];
  // On the feed this counts ALL offers; on /my it counts only PENDING ones,
  // because that's the number the buyer needs to act on.
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
  currency: Currency;
  message: string | null;
  status: RequirementOfferStatus;
  listingId: string | null;
  bidId: string | null;
  // Present once the offer becomes a deal — the route to the transaction.
  bid?: {
    id: string;
    transaction?: {
      id: string;
      paymentStatus: PaymentStatus;
      deliveryStatus: DeliveryStatus;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
}

export interface Transaction {
  id: string;
  listingId: string;
  listing?: Listing;
  bidId: string;
  bid?: Bid;
  farmerId: string;
  farmer?: User;
  buyerId: string;
  buyer?: User;
  finalPricePerUnit: number;
  totalAmount: number;
  currency: Currency;
  platformFeePercent: number;
  platformFeeAmount: number;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  // Present when /transactions is asked to include shipment state (Deliveries page)
  shipment?: Shipment | null;
  createdAt: string;
}

export interface NegotiationRound {
  round: number;
  from: 'farmer_agent' | 'buyer_agent';
  action: 'accept' | 'reject' | 'counter';
  price: number;
  reasoning: string;
}

export interface Negotiation {
  id: string;
  listingId: string;
  listing?: Listing;
  bidId: string;
  bid?: Bid;
  farmerAgentId: string;
  buyerAgentId: string;
  rounds: NegotiationRound[];
  finalOutcome: NegotiationOutcome;
  startedAt: string;
  endedAt: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: any;
  createdAt: string;
}

// --- Logistics ---
export type LogisticsType = 'TRUCKING' | 'COLD_CHAIN' | 'LOCAL' | 'FREIGHT' | 'EXPORT';
export type ShipmentStatus = 'PENDING_PICKUP' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
export type PaidBy = 'BUYER' | 'FARMER' | 'SPLIT';

export interface LogisticsPartner {
  id: string;
  name: string;
  type: LogisticsType;
  coverageRegions: string[];
  coverageCountries: string[];
  vehicleTypes: string[];
  minQuantityKg: number;
  maxQuantityKg: number;
  costPerKmPerKg: number;
  avgDeliveryDays: number;
  rating: number;
  contactEmail: string;
  contactPhone: string;
  apiEndpoint: string | null;
  commissionPercent: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingUpdate {
  timestamp: string;
  location: string;
  status: string;
  note: string;
}

export interface Shipment {
  id: string;
  transactionId: string;
  transaction?: Transaction;
  logisticsPartnerId: string;
  logisticsPartner?: LogisticsPartner;
  pickupLocation: string;
  pickupDate: string;
  deliveryLocation: string;
  estimatedDeliveryDate: string;
  actualDeliveryDate: string | null;
  vehicleType: string;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  distanceKm: number;
  totalWeightKg: number;
  transportCost: number;
  platformCommission: number;
  currency: Currency;
  paidBy: PaidBy;
  splitPercentBuyer: number | null;
  status: ShipmentStatus;
  trackingUpdates: TrackingUpdate[];
  proofOfDelivery: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransportQuote {
  partner: LogisticsPartner;
  transportCost: number;
  platformCommission: number;
  totalCost: number;
  estimatedDays: number;
}

// --- API Response types ---
export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface ApiError {
  error: true;
  message: string;
  statusCode: number;
}
