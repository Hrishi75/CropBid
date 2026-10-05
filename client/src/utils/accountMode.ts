// Selling | Buying for a seller approved to buy (CLAUDE.md §4). Kept out of
// AuthContext so that file exports only components and hooks.
import type { User } from '../types';

export type AccountMode = 'SELL' | 'BUY';

/** A seller whose buyer application has also been approved. */
export function canSwitchToBuying(u: User | null | undefined): boolean {
  return u?.role === 'FARMER' && u.buyerProfile?.status === 'APPROVED';
}
