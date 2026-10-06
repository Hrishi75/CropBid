// =============================================================================
// The breach register refuses to let a reportable breach be closed unreported
// =============================================================================
// On a real Postgres: the rules are checked on the row as it will be saved,
// and the conditional update is the guard against two people editing at once.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('./audit.service', () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { createIncident, listIncidents, updateIncident, REPORT_DUE_MS } from './incident.service';

const ADMIN = 'incident-test-admin';
const NOW = new Date('2026-10-06T10:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

async function clean() {
  await prisma.securityIncident.deleteMany({ where: { createdById: ADMIN } });
}
beforeEach(clean);
afterAll(clean);

const base = { title: 'Leaked admin session', description: 'Payout reads spiked overnight' };

describe('the breach register', () => {
  it('starts the 72 hours from detection and says when the report is overdue', async () => {
    await createIncident(ADMIN, { ...base, detectedAt: hoursAgo(80), personalDataAffected: true }, NOW);
    const { incidents } = await listIncidents(1, NOW);
    const mine = incidents.find((i) => i.createdById === ADMIN)!;
    expect(mine.reportDueAt.getTime()).toBe(hoursAgo(80).getTime() + REPORT_DUE_MS);
    expect(mine.reportOverdue).toBe(true);
  });

  it('is not overdue when no personal data was affected', async () => {
    await createIncident(ADMIN, { ...base, detectedAt: hoursAgo(80) }, NOW);
    const { incidents } = await listIncidents(1, NOW);
    expect(incidents.find((i) => i.createdById === ADMIN)!.reportOverdue).toBe(false);
  });

  it('refuses to close a personal-data breach until the Board and users are told', async () => {
    const incident = await createIncident(ADMIN, { ...base, detectedAt: hoursAgo(10), personalDataAffected: true }, NOW);

    await expect(updateIncident(ADMIN, incident.id, { status: 'CLOSED' }, NOW)).rejects.toMatchObject({ statusCode: 409 });

    await updateIncident(ADMIN, incident.id, {
      boardNotifiedAt: hoursAgo(9), boardReportAt: hoursAgo(5), usersNotifiedAt: hoursAgo(4),
    }, NOW);
    const closed = await updateIncident(ADMIN, incident.id, { status: 'CLOSED' }, NOW);
    expect(closed.status).toBe('CLOSED');
  });

  it('refuses a time in the future, and one before detection', async () => {
    const incident = await createIncident(ADMIN, { ...base, detectedAt: hoursAgo(10) }, NOW);
    await expect(updateIncident(ADMIN, incident.id, { usersNotifiedAt: new Date(NOW.getTime() + 3600_000) }, NOW))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(updateIncident(ADMIN, incident.id, { usersNotifiedAt: hoursAgo(11) }, NOW))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses the detailed report before the Board was first told', async () => {
    const incident = await createIncident(ADMIN, { ...base, detectedAt: hoursAgo(10) }, NOW);
    await expect(updateIncident(ADMIN, incident.id, { boardReportAt: hoursAgo(2) }, NOW))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses an edit made against a version someone else has since changed', async () => {
    const incident = await createIncident(ADMIN, { ...base, detectedAt: hoursAgo(10) }, NOW);
    const stale = await prisma.securityIncident.findUniqueOrThrow({ where: { id: incident.id } });
    await updateIncident(ADMIN, incident.id, { actionsTaken: 'Reset the admin password' }, NOW);

    // Replay the update with the row as it was before that edit.
    const spy = vi.spyOn(prisma.securityIncident, 'findUnique').mockResolvedValueOnce(stale);
    await expect(updateIncident(ADMIN, incident.id, { status: 'CONTAINED' }, NOW)).rejects.toMatchObject({ statusCode: 409 });
    spy.mockRestore();
  });
});
