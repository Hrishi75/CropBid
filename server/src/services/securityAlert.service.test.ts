// =============================================================================
// Security alerts fire on the pattern, once, and never break the request
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(() => Promise.resolve([{ id: 'admin-1' }, { id: 'admin-2' }])) },
    auditLog: { count: vi.fn() },
  },
}));
vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve()) }));
vi.mock('./email.service', () => ({ sendEmail: vi.fn(() => Promise.resolve()) }));
vi.mock('./audit.service', () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { createNotification } from './notification.service';
import { sendEmail } from './email.service';
import {
  THRESHOLDS,
  checkPasswordResetVolume,
  checkPayoutReadVolume,
  recordFailedSignIn,
  resetSecurityAlertState,
} from './securityAlert.service';

const count = vi.mocked(prisma.auditLog.count);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  resetSecurityAlertState();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('failed sign-in burst', () => {
  it('stays quiet below the threshold', async () => {
    const t = 1_000_000;
    for (let i = 0; i < THRESHOLDS.failedSignIns.count - 1; i++) recordFailedSignIn(t + i);
    await flush();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('alerts every admin and the inbox when the burst crosses it, once', async () => {
    const t = 1_000_000;
    for (let i = 0; i < THRESHOLDS.failedSignIns.count + 20; i++) recordFailedSignIn(t + i);
    await flush();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createNotification).mock.calls[0][0]).toMatchObject({ type: 'SECURITY_ALERT' });
  });

  it('forgets failures older than the window', async () => {
    const { count: n, windowMs } = THRESHOLDS.failedSignIns;
    for (let i = 0; i < n - 1; i++) recordFailedSignIn(0);
    recordFailedSignIn(windowMs + 1);
    await flush();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('admin volume', () => {
  it('alerts on many payout reads by one admin', async () => {
    count.mockResolvedValue(THRESHOLDS.payoutReads.count as never);
    await checkPayoutReadVolume('admin-1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].text).toContain('admin-1');
  });

  it('stays quiet on a normal day of payouts', async () => {
    count.mockResolvedValue(3 as never);
    await checkPayoutReadVolume('admin-1');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('alerts on many password resets, once an hour', async () => {
    count.mockResolvedValue(THRESHOLDS.passwordResets.count as never);
    const t = Date.now();
    await checkPasswordResetVolume('admin-1', t);
    await checkPasswordResetVolume('admin-1', t + 60_000);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when the database does', async () => {
    count.mockRejectedValue(new Error('down') as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(checkPayoutReadVolume('admin-1')).resolves.toBeUndefined();
  });
});
