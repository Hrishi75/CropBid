// =============================================================================
// Audit Service — Append-only log of sensitive actions
// =============================================================================
// Call recordAudit() from any service that mutates a security- or
// money-relevant entity (transactions, bids, listings, user trust scores,
// admin actions). Failures are logged but never thrown — auditing must
// never block the primary operation.
//
// Pull actorId / IP / userAgent from the Express request when available
// (use auditFromRequest as a convenience).
// =============================================================================

import type { Request } from 'express';
import { prisma } from '../lib/prisma';

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;        // dot-separated verb, e.g. "admin.user.update"
  entityType: string;    // "User", "Bid", "Transaction", ...
  entityId: string;
  metadata?: unknown;    // before/after diff, reason, request body, etc.
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? null) as any,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to record', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Convenience wrapper that pulls actor + IP + UA off the Express request.
// Service code typically only knows the request when called from a
// controller; service-to-service calls should use recordAudit directly.
export function auditFromRequest(
  req: Request,
  partial: Omit<AuditInput, 'actorId' | 'actorRole' | 'ip' | 'userAgent'>
): Promise<void> {
  return recordAudit({
    ...partial,
    actorId: req.user?.userId ?? null,
    actorRole: req.user?.role ?? null,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  });
}
