// =============================================================================
// The breach register
// =============================================================================
// See SecurityIncident in schema.prisma and docs/breach-runbook.md. Three rules
// live here, so they bind any caller:
//
//   - No time may be in the future. "Board notified tomorrow" is a plan, and a
//     register that holds plans as facts is no record at all.
//   - The Board cannot be sent the detailed report before it was first told,
//     and nobody is told before the breach was detected.
//   - An incident that touched personal data cannot be CLOSED until the
//     Board's report and the notice to the people affected are both recorded.
//     Closing is the step that would otherwise let the duty be forgotten.
//   - Nor can that duty be dropped by unticking "personal data affected": once
//     ticked, it is unticked only with a written reason why exposure was ruled
//     out, which stays on the incident and in the audit log.
//
// Every write leaves an audit row naming who made it.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { recordAudit } from './audit.service';
import type { IncidentStatus } from '../generated/prisma/client';

/** The Board's detailed report is due this long after we became aware. */
export const REPORT_DUE_MS = 72 * 60 * 60 * 1000;

export interface IncidentInput {
  title?: string;
  description?: string;
  detectedAt?: Date;
  status?: IncidentStatus;
  personalDataAffected?: boolean;
  dataCategories?: string | null;
  usersAffected?: number | null;
  actionsTaken?: string | null;
  /** Required to untick personalDataAffected once it has been ticked. */
  exposureRuledOut?: string | null;
  boardNotifiedAt?: Date | null;
  boardReportAt?: Date | null;
  usersNotifiedAt?: Date | null;
}

type Incident = Awaited<ReturnType<typeof prisma.securityIncident.findUniqueOrThrow>>;

/** Check the incident as it will be saved, not just the fields being changed. */
function assertConsistent(next: Omit<Incident, 'id' | 'createdById' | 'createdAt' | 'updatedAt'>, now: Date) {
  const times: [string, Date | null][] = [
    ['When it was detected', next.detectedAt],
    ['When the Board was told', next.boardNotifiedAt],
    ['When the report went to the Board', next.boardReportAt],
    ['When users were told', next.usersNotifiedAt],
  ];
  for (const [label, at] of times) {
    if (at && at.getTime() > now.getTime() + 60_000) throw new ApiError(400, `${label} cannot be in the future`);
  }
  for (const [label, at] of times.slice(1)) {
    if (at && at < next.detectedAt) throw new ApiError(400, `${label} cannot be before the breach was detected`);
  }
  if (next.boardReportAt && !next.boardNotifiedAt) {
    throw new ApiError(400, 'Record when the Board was first told before recording the detailed report');
  }
  if (next.boardReportAt && next.boardNotifiedAt && next.boardReportAt < next.boardNotifiedAt) {
    throw new ApiError(400, 'The detailed report cannot be before the Board was first told');
  }
  if (next.status === 'CLOSED' && next.personalDataAffected && (!next.boardReportAt || !next.usersNotifiedAt)) {
    throw new ApiError(
      409,
      'Personal data was affected, so this stays open until the report to the Board and the notice to the people affected are both recorded',
    );
  }
}

/** What the register shows beside each incident: where the 72 hours stand. */
function withDeadline(incident: Incident, now: Date) {
  const reportDueAt = new Date(incident.detectedAt.getTime() + REPORT_DUE_MS);
  const owed = incident.personalDataAffected && !incident.boardReportAt;
  return { ...incident, reportDueAt, reportOverdue: owed && now > reportDueAt };
}

/**
 * The register's headline numbers, counted over every incident rather than the
 * page on screen: a report owed on page two is still owed.
 */
async function summarise(now: Date) {
  const owed = { personalDataAffected: true, boardReportAt: null, status: { not: 'CLOSED' as const } };
  const [notClosed, reportOwed, reportOverdue] = await Promise.all([
    prisma.securityIncident.count({ where: { status: { not: 'CLOSED' } } }),
    prisma.securityIncident.count({ where: owed }),
    prisma.securityIncident.count({ where: { ...owed, detectedAt: { lt: new Date(now.getTime() - REPORT_DUE_MS) } } }),
  ]);
  return { notClosed, reportOwed, reportOverdue };
}

export async function listIncidents(page = 1, now = new Date()) {
  const take = 50;
  const skip = (Math.max(1, page) - 1) * take;
  const [rows, total] = await Promise.all([
    prisma.securityIncident.findMany({
      // Open ones first, then newest: the register is worked from the top.
      orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.securityIncident.count(),
  ]);
  return {
    incidents: rows.map((r) => withDeadline(r, now)),
    summary: await summarise(now),
    pagination: { page, limit: take, total, totalPages: Math.max(1, Math.ceil(total / take)) },
  };
}

export async function createIncident(adminId: string, input: IncidentInput, now = new Date()) {
  const title = input.title?.trim();
  const description = input.description?.trim();
  if (!title) throw new ApiError(400, 'Give the incident a short title');
  if (!description) throw new ApiError(400, 'Say what happened, as far as is known');

  const data = {
    title,
    description,
    detectedAt: input.detectedAt ?? now,
    status: input.status ?? 'OPEN',
    personalDataAffected: input.personalDataAffected ?? false,
    dataCategories: input.dataCategories?.trim() || null,
    usersAffected: input.usersAffected ?? null,
    actionsTaken: input.actionsTaken?.trim() || null,
    exposureRuledOut: null,
    boardNotifiedAt: input.boardNotifiedAt ?? null,
    boardReportAt: input.boardReportAt ?? null,
    usersNotifiedAt: input.usersNotifiedAt ?? null,
  } as const;
  assertConsistent(data, now);

  const incident = await prisma.securityIncident.create({ data: { ...data, createdById: adminId } });
  await recordAudit({
    actorId: adminId, actorRole: 'ADMIN',
    action: 'security.incident.created', entityType: 'SecurityIncident', entityId: incident.id,
    metadata: { personalDataAffected: incident.personalDataAffected },
  });
  return withDeadline(incident, now);
}

export async function updateIncident(adminId: string, id: string, input: IncidentInput, now = new Date()) {
  const existing = await prisma.securityIncident.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Incident not found');

  const patch: IncidentInput = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new ApiError(400, 'Give the incident a short title');
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) {
    if (!input.description.trim()) throw new ApiError(400, 'Say what happened, as far as is known');
    patch.description = input.description.trim();
  }
  if (existing.personalDataAffected && input.personalDataAffected === false) {
    const reason = input.exposureRuledOut?.trim();
    if (!reason) {
      throw new ApiError(
        400,
        'This incident was recorded as exposing personal data. Say why that has been ruled out before changing it',
      );
    }
    patch.exposureRuledOut = reason;
  }

  for (const key of ['dataCategories', 'actionsTaken'] as const) {
    if (input[key] !== undefined) patch[key] = input[key]?.trim() || null;
  }
  for (const key of [
    'detectedAt', 'status', 'personalDataAffected', 'usersAffected',
    'boardNotifiedAt', 'boardReportAt', 'usersNotifiedAt',
  ] as const) {
    if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
  }

  assertConsistent({ ...existing, ...patch } as Incident, now);

  // Conditional on the row as read, so two people working one incident at
  // once cannot each save a version checked against a state that is gone.
  const { count } = await prisma.securityIncident.updateMany({
    where: { id, updatedAt: existing.updatedAt },
    data: patch,
  });
  if (count === 0) throw new ApiError(409, 'Someone else changed this incident just now. Reload and try again.');

  await recordAudit({
    actorId: adminId, actorRole: 'ADMIN',
    action: 'security.incident.updated', entityType: 'SecurityIncident', entityId: id,
    metadata: {
      fields: Object.keys(patch),
      status: patch.status ?? existing.status,
      ...(patch.exposureRuledOut ? { exposureRuledOut: patch.exposureRuledOut } : {}),
    },
  });
  return withDeadline(await prisma.securityIncident.findUniqueOrThrow({ where: { id } }), now);
}
