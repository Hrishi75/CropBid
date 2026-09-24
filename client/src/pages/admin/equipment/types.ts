// =============================================================================
// Shapes the admin machinery screens share, as /api/admin/equipment sends them
// =============================================================================
// Dealers arrive without a phone number or an email: those leave the server
// only when a farmer raises an enquiry, so no admin read carries them either.
//
// `verified` and `smamEmpanelled` are claims CropBid makes to a farmer, so they
// arrive as flags to display and are changed through their own endpoint
// (ClaimsForm), never as two more fields on the edit form.
// =============================================================================

export { apiMessage } from '../inputs/types';

export interface AdminDealer {
  id: string;
  name: string;
  location: string;
  state: string;
  verified: boolean;
  smamEmpanelled: boolean;
  rating: number;
  active: boolean;
  machines: number;
  live: number;
}

export interface AdminMachine {
  id: string;
  dealerId: string;
  title: string;
  category: string;
  brand: string | null;
  modelName: string | null;
  condition: 'NEW' | 'USED';
  yearMade: number | null;
  mode: 'SALE' | 'RENT' | 'BOTH';
  salePrice: number | null;
  rentPricePerDay: number | null;
  rentPricePerHour: number | null;
  securityDeposit: number | null;
  powerHp: number | null;
  specs: string[];
  description: string | null;
  location: string;
  state: string;
  active: boolean;
  live: boolean;
  hiddenBecause: string[];
  enquiries: number;
  dealer: {
    id: string;
    name: string;
    location: string;
    state: string;
    verified: boolean;
    smamEmpanelled: boolean;
    rating: number;
    active: boolean;
  };
}

export interface CategoryCount {
  id: string;
  label: string;
  total: number;
  live: number;
}

export const MODES: { value: 'SALE' | 'RENT' | 'BOTH'; label: string }[] = [
  { value: 'SALE', label: 'For sale' },
  { value: 'RENT', label: 'For hire' },
  { value: 'BOTH', label: 'Either' },
];

/** What a farmer pays, in the words /equipment uses. */
export function priceLine(m: AdminMachine): string {
  const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const parts: string[] = [];
  if (m.salePrice != null) parts.push(`${rupees(m.salePrice)} to buy`);
  if (m.rentPricePerDay != null) parts.push(`${rupees(m.rentPricePerDay)}/day`);
  if (m.rentPricePerHour != null) parts.push(`${rupees(m.rentPricePerHour)}/hour`);
  return parts.join(' · ');
}
