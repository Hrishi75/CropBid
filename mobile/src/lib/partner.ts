// =============================================================================
// Partner metadata — one place for labels and status meta
// =============================================================================
// Selling on CropBid, and buying in bulk, are applied for and reviewed by hand:
// the profile row is created with status SUBMITTED and the server refuses every
// dashboard route until an admin sets it to APPROVED (see
// server/src/middleware/roleGuard.ts, requireApprovedPartner). A client that
// did not know that would drop a new farmer into a dashboard where every single
// action comes back 403.
//
// So the app checks the same thing the server does, and this file is where the
// answer lives. Mirrors client/src/utils/partner.ts — the same copy, the same
// tones, so an applicant reading the status on the site and on the phone is
// told the same thing in the same words.
// =============================================================================

import type { PartnerStatus, User } from '../api/types';
import { colors } from '../theme';

// The status page renders these; `color` maps onto the brand tokens
// (sage = good, wheat = waiting on someone, ember = attention).
export const PARTNER_STATUS_META: Record<PartnerStatus, { label: string; color: string }> = {
  SUBMITTED: { label: 'Submitted', color: colors.wheat },
  UNDER_REVIEW: { label: 'Under review', color: colors.wheat },
  NEEDS_INFO: { label: 'Needs info', color: colors.ember },
  APPROVED: { label: 'Approved', color: colors.sage },
  REJECTED: { label: 'Rejected', color: colors.ember },
  SUSPENDED: { label: 'Suspended', color: colors.ember },
};

export interface PartnerApplication {
  kind: 'SELLER' | 'BUYER';
  status: PartnerStatus;
  note: string | null;
}

/** The partner application on a user, whichever side they applied on. */
export function partnerApplication(user: User | null | undefined): PartnerApplication | null {
  if (!user) return null;
  if (user.role === 'FARMER' && user.farmerProfile) {
    return {
      kind: 'SELLER',
      // An older server build, or a profile written before the review flow
      // existed, has no status at all. Treating that as APPROVED is the safe
      // reading: those accounts were live before the gate went up, and the
      // server is the real fence either way.
      status: user.farmerProfile.status ?? 'APPROVED',
      note: user.farmerProfile.statusNote ?? null,
    };
  }
  if (user.role === 'BUYER' && user.buyerProfile) {
    return {
      kind: 'BUYER',
      status: user.buyerProfile.status ?? 'APPROVED',
      note: user.buyerProfile.statusNote ?? null,
    };
  }
  return null;
}

/** True when this user is a partner whose application has not been approved. */
export function isPendingPartner(user: User | null | undefined): boolean {
  const app = partnerApplication(user);
  return app !== null && app.status !== 'APPROVED';
}
