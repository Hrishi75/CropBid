// Who posts a restock list (many crops, one delivery) rather than one request.
//
// A retailer, and a local shop on its buying side: both are a store filling
// its shelves, and a shop that applied to buy is filed under whatever company
// type it picked (often SMALL_BUSINESS), so the seller kind is what tells us.
// In buying mode the user here is the BUYER view of the account and still
// carries its farmerProfile (AuthContext).
import type { User } from '../api/types';

export function restocksByList(user: User | null | undefined): boolean {
  if (!user || user.role !== 'BUYER') return false;
  return user.buyerProfile?.companyType === 'RETAILER' || user.farmerProfile?.sellerType === 'LOCAL_SHOP';
}

/** Where a buyer's "post what you need" goes. */
export const postRoute = (user: User | null | undefined) => (restocksByList(user) ? 'RestockList' : 'CreateRequirement');
