// =============================================================================
// TypeScript Types — Mirrors the Prisma schema
// =============================================================================
// These types define the shape of data flowing between client and server.
// They match the Prisma models but only include fields the client sees
// (no password, no refreshToken).
// =============================================================================

// --- Enums ---
export type Role = 'FARMER' | 'BUYER' | 'ADMIN';
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';
export type Language = 'EN' | 'HI';
export type Unit = 'KG' | 'QUINTAL' | 'TONNE';
export type QualityGrade = 'A' | 'B' | 'C';
export type ListingStatus = 'ACTIVE' | 'IN_AUCTION' | 'SOLD' | 'EXPIRED';
export type CompanyType = 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER';
export type AgentType = 'FARMER_AGENT' | 'BUYER_AGENT';
export type NegotiationStyle = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
export type BidStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';
export type PaymentStatus = 'ESCROW' | 'RELEASED' | 'REFUNDED';
export type DeliveryStatus = 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED';
export type NegotiationOutcome = 'DEAL' | 'NO_DEAL' | 'IN_PROGRESS';

// --- Models ---
export interface User {
  id: string;
  name: string;
  email: string;
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
  unit: Unit;
  qualityGrade: QualityGrade;
  pricePerUnitMin: number;
  pricePerUnitMax: number;
  currency: Currency;
  harvestDate: string | null;
  expiryDate: string | null;
  description: string | null;
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
  isAgentBid: boolean;
  status: BidStatus;
  counterPrice: number | null;
  createdAt: string;
  expiresAt: string | null;
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
