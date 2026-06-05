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
