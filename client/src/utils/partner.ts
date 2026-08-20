// =============================================================================
// Partner metadata — one place for labels and status meta
// =============================================================================
// Consumed by the partner landing, the application form, the status page and
// the admin review queue. Keeping the copy here means "Local shop" is spelled
// the same everywhere and a status colour can't drift between screens.
// =============================================================================

import type { PartnerStatus, SellerType, User } from '../types';

export const SELLER_TYPE_LABEL: Record<SellerType, string> = {
  FARMER: 'Farmer',
  LOCAL_SHOP: 'Local shop',
  WHOLESALER: 'Wholesaler',
};

export const SHOP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'KIRANA', label: 'Kirana / grocery' },
  { value: 'VEGETABLE', label: 'Vegetables & fruit' },
  { value: 'DAIRY', label: 'Dairy' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'GENERAL', label: 'General store' },
  { value: 'OTHER', label: 'Other' },
];

// The status page and the admin queue both render these; `tone` maps onto the
// design tokens (sage = good, wheat = waiting on someone, ember = attention).
export const PARTNER_STATUS_META: Record<PartnerStatus, { label: string; color: string }> = {
  SUBMITTED: { label: 'Submitted', color: 'var(--cb-wheat)' },
  UNDER_REVIEW: { label: 'Under review', color: 'var(--cb-wheat)' },
  NEEDS_INFO: { label: 'Needs info', color: 'var(--cb-ember)' },
  APPROVED: { label: 'Approved', color: 'var(--cb-sage)' },
  REJECTED: { label: 'Rejected', color: 'var(--cb-ember)' },
  SUSPENDED: { label: 'Suspended', color: 'var(--cb-ember)' },
};

/** The partner application on a user, whichever side they applied on. */
export function partnerApplication(user: User | null | undefined) {
  if (!user) return null;
  if (user.role === 'FARMER' && user.farmerProfile) {
    return { kind: 'SELLER' as const, status: user.farmerProfile.status, note: user.farmerProfile.statusNote };
  }
  if (user.role === 'BUYER' && user.buyerProfile) {
    return { kind: 'BUYER' as const, status: user.buyerProfile.status, note: user.buyerProfile.statusNote };
  }
  return null;
}

/** True when this user is a partner whose application has not been approved. */
export function isPendingPartner(user: User | null | undefined): boolean {
  const app = partnerApplication(user);
  return app !== null && app.status !== 'APPROVED';
}
