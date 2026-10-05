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

/**
 * The partner application on a user, whichever side they applied on.
 *
 * NOT GATED ON user.role. An applicant is a CONSUMER until a reviewer approves
 * them, so reading the role returned null for exactly the people who need to
 * see "under review", and the status page bounced them to the homepage. A
 * profile exists only once somebody has applied, so its presence is the
 * question. The seller side wins if both exist: it has the listings and money
 * behind it. Same rule as mobile/src/lib/partner.
 */
export function partnerApplication(user: User | null | undefined) {
  if (!user) return null;
  if (user.farmerProfile) {
    return { kind: 'SELLER' as const, status: user.farmerProfile.status, note: user.farmerProfile.statusNote };
  }
  if (user.buyerProfile) {
    return { kind: 'BUYER' as const, status: user.buyerProfile.status, note: user.buyerProfile.statusNote };
  }
  return null;
}

/**
 * True when this user is a partner whose application has not been approved.
 *
 * This one KEEPS the role check, because it decides navigation: it keeps an
 * unapproved FARMER or BUYER out of a dashboard where every action 403s. A
 * CONSUMER waiting on a decision has no such dashboard and keeps shopping.
 */
export function isPendingPartner(user: User | null | undefined): boolean {
  if (!user || (user.role !== 'FARMER' && user.role !== 'BUYER')) return false;
  const app = partnerApplication(user);
  return app !== null && app.status !== 'APPROVED';
}

/** A shopper whose application to sell or buy is still waiting on a decision. */
export function hasOpenApplication(user: User | null | undefined): boolean {
  const app = partnerApplication(user);
  return user?.role === 'CONSUMER' && app !== null && app.status !== 'APPROVED';
}

/**
 * The name a shopper sees above a lot: the shop's trading name if it has one,
 * otherwise the person's own. Mirrors displayName() in browse.service.ts, which
 * is what the shop list and shop page are keyed by — the two must agree or a
 * search result and the shop it belongs to will disagree about the shop's name.
 */
export function sellerDisplayName(
  seller: { businessName?: string | null; user?: { name?: string | null } | null } | null | undefined,
): string | null {
  if (!seller) return null;
  return seller.businessName?.trim() || seller.user?.name?.trim() || null;
}

/** Human label for FarmerProfile.shopType, which is stored free-form. */
export function shopTypeLabel(shopType: string | null | undefined): string | null {
  if (!shopType) return null;
  const match = SHOP_TYPE_OPTIONS.find((o) => o.value.toLowerCase() === shopType.toLowerCase());
  return match?.label ?? shopType;
}
