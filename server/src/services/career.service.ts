// =============================================================================
// Careers: the jobs on /careers
// =============================================================================
// An admin writes them (/admin/careers); anyone reads the published ones.
// A draft never leaves the admin routes, so a half-written posting cannot be
// found by guessing its id. Applying happens off the site (email or the
// posting's own link), so nothing here stores a candidate's details.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { recordAudit } from './audit.service';
import type { JobType } from '../generated/prisma/client';

export interface JobInput {
  title?: string;
  team?: string | null;
  location?: string;
  type?: JobType;
  description?: string;
  applyUrl?: string | null;
  published?: boolean;
}

// What a visitor gets: no creator id, nothing an admin alone needs.
const PUBLIC_SELECT = {
  id: true,
  title: true,
  team: true,
  location: true,
  type: true,
  description: true,
  applyUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Published jobs, newest first. Public. */
export async function listPublishedJobs() {
  return prisma.jobOpening.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    select: PUBLIC_SELECT,
  });
}

/** Every job, drafts included, newest first. Admin. */
export async function listAllJobs() {
  return prisma.jobOpening.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createJob(actorId: string, input: Required<Pick<JobInput, 'title' | 'location' | 'description'>> & JobInput) {
  const job = await prisma.jobOpening.create({
    data: {
      title: input.title,
      team: input.team ?? null,
      location: input.location,
      type: input.type ?? 'FULL_TIME',
      description: input.description,
      applyUrl: input.applyUrl ?? null,
      published: input.published ?? false,
      createdById: actorId,
    },
  });
  await recordAudit({ actorId, actorRole: 'ADMIN', action: 'admin.job.create', entityType: 'JobOpening', entityId: job.id, metadata: { title: job.title, published: job.published } });
  return job;
}

export async function updateJob(actorId: string, id: string, input: JobInput) {
  const existing = await prisma.jobOpening.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Job not found');
  const job = await prisma.jobOpening.update({ where: { id }, data: input });
  await recordAudit({ actorId, actorRole: 'ADMIN', action: 'admin.job.update', entityType: 'JobOpening', entityId: id, metadata: { fields: Object.keys(input) } });
  return job;
}

export async function deleteJob(actorId: string, id: string) {
  // deleteMany so a double click is a 404, not a 500.
  const { count } = await prisma.jobOpening.deleteMany({ where: { id } });
  if (count === 0) throw new ApiError(404, 'Job not found');
  await recordAudit({ actorId, actorRole: 'ADMIN', action: 'admin.job.delete', entityType: 'JobOpening', entityId: id });
}
