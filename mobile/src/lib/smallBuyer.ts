// A small buyer: a small business (a bhaji center, a caterer), or a local shop
// on its buying side. They buy a few quintals from nearby, not a whole lot
// freighted across the country, so the market starts near them and a bid
// starts small.
import type { Unit, User } from '../api/types';

export function buysSmall(user: User | null | undefined): boolean {
  if (!user || user.role !== 'BUYER') return false;
  return user.buyerProfile?.companyType === 'SMALL_BUSINESS' || user.farmerProfile?.sellerType === 'LOCAL_SHOP';
}

/** The amount a small buyer's bid starts at, in the lot's own unit: about a tonne. */
export const SMALL_START: Record<Unit, number> = { KG: 1000, QUINTAL: 10, TONNE: 1 };

/** Steps offered on the bid card, in the lot's unit. */
export const SMALL_STEPS: Record<Unit, number[]> = { KG: [200, 500, 1000], QUINTAL: [2, 5, 10], TONNE: [0.5, 1, 2] };
