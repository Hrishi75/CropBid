// =============================================================================
// Careers: drafts stay in the admin panel, and the apply link is https only
// =============================================================================
// On a real Postgres for the service; the controller's schema is driven
// through its handler with a fake request.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('./audit.service', () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { createJob, deleteJob, listAllJobs, listPublishedJobs, updateJob } from './career.service';
import { create } from '../controllers/career.controller';

const ADMIN = 'career-test-admin';

async function clean() {
  await prisma.jobOpening.deleteMany({ where: { createdById: ADMIN } });
}
beforeEach(clean);
afterAll(clean);

const base = { title: 'Field operations lead', location: 'Nagpur', description: 'Run pickups.' };

describe('careers', () => {
  it('shows a job publicly only once it is published', async () => {
    const job = await createJob(ADMIN, base);
    expect(job.published).toBe(false);
    expect((await listPublishedJobs()).some((j) => j.id === job.id)).toBe(false);
    expect((await listAllJobs()).some((j) => j.id === job.id)).toBe(true);

    await updateJob(ADMIN, job.id, { published: true });
    const pub = (await listPublishedJobs()).find((j) => j.id === job.id)!;
    expect(pub).toBeTruthy();
    expect(pub).not.toHaveProperty('createdById');

    await updateJob(ADMIN, job.id, { published: false });
    expect((await listPublishedJobs()).some((j) => j.id === job.id)).toBe(false);
  });

  it('answers 404 for a job that is not there', async () => {
    await expect(updateJob(ADMIN, 'nope', { title: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    const job = await createJob(ADMIN, base);
    await deleteJob(ADMIN, job.id);
    await expect(deleteJob(ADMIN, job.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  async function post(body: Record<string, unknown>) {
    const res: any = { statusCode: 200, body: undefined };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: unknown) => { res.body = b; return res; };
    const next = vi.fn();
    await create({ body, user: { userId: ADMIN } } as any, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
  }

  it('refuses an apply link that is not https', async () => {
    for (const applyUrl of ['javascript:alert(1)', 'http://example.com', 'ftp://x']) {
      expect((await post({ ...base, applyUrl })).statusCode).toBe(400);
    }
    const ok = await post({ ...base, applyUrl: 'https://forms.example.com/apply' });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.job.applyUrl).toBe('https://forms.example.com/apply');
  });

  it('stores a blank team or link as none, and needs a title, place and description', async () => {
    const ok = await post({ ...base, team: '  ', applyUrl: '' });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.job.team).toBeNull();
    expect(ok.body.job.applyUrl).toBeNull();
    expect((await post({ ...base, title: '   ' })).statusCode).toBe(400);
    expect((await post({ title: 'x', description: 'y' })).statusCode).toBe(400);
    expect((await post({ ...base, type: 'FREELANCE' })).statusCode).toBe(400);
  });
});
