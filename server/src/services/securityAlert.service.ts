// =============================================================================
// Security alerts: noticing a breach while it is happening
// =============================================================================
// The DPDP Rules give 72 hours from becoming aware of a breach to report it to
// the Data Protection Board, which is only possible if something tells us. A
// person reading logs is not that. These are the signals the platform can see
// for itself, each one the shape a real compromise takes here:
//
//   FAILED_SIGNIN_BURST   many wrong passwords across the platform in a few
//                         minutes: credential stuffing, which the per-account
//                         rate limit does not see because it spreads thin.
//   PAYOUT_READ_VOLUME    one admin opening many sellers' bank details in an
//                         hour. A person paying sellers opens a few; a stolen
//                         admin session harvesting them opens dozens.
//   PASSWORD_RESET_VOLUME one admin resetting many passwords in an hour, which
//                         is how a stolen admin session takes over accounts.
//
// An alert goes to every admin's bell AND to an inbox (securityAlertEmail),
// because the admin account doing the damage can read and clear its own bell.
// It also writes an audit row, which is where an incident's timeline starts.
//
// Never throws. A security alert that failed to send must not fail the sign-in
// or the read that triggered it, and an attacker must not be able to break a
// request by tripping one. Each alert is sent at most once an hour per kind
// and subject, so a sustained attack is one alert, not a thousand.
//
// The counters for failed sign-ins live in memory, per process. Two processes
// in a deploy's overlap each count half, which only delays an alert by the
// length of a deploy. The admin signals are counted from the audit log, so
// they are exact.
// =============================================================================

import { prisma } from '../lib/prisma';
import { config } from '../config';
import { createNotification } from './notification.service';
import { sendEmail } from './email.service';
import { recordAudit } from './audit.service';

export const THRESHOLDS = {
  failedSignIns: { count: 50, windowMs: 10 * 60_000 },
  payoutReads: { count: 20, windowMs: 60 * 60_000 },
  passwordResets: { count: 5, windowMs: 60 * 60_000 },
} as const;

const REPEAT_AFTER_MS = 60 * 60_000;

export type SecurityAlertKind = 'FAILED_SIGNIN_BURST' | 'PAYOUT_READ_VOLUME' | 'PASSWORD_RESET_VOLUME';

const lastSent = new Map<string, number>();
let failedSignIns: number[] = [];

/** For tests: forget every counter and throttle. */
export function resetSecurityAlertState(): void {
  lastSent.clear();
  failedSignIns = [];
}

async function raise(
  kind: SecurityAlertKind,
  subject: string,
  title: string,
  message: string,
  now: number,
): Promise<boolean> {
  const key = `${kind}:${subject}`;
  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < REPEAT_AFTER_MS) return false;
  lastSent.set(key, now);

  await recordAudit({
    actorRole: 'SYSTEM',
    action: 'security.alert',
    entityType: 'SecurityAlert',
    entityId: kind,
    metadata: { kind, subject, message },
  });

  const admins = await prisma.user
    .findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: 'SECURITY_ALERT',
        title,
        message,
        data: { kind },
      }).catch(() => {}),
    ),
  );

  await sendEmail({
    to: config.securityAlertEmail,
    subject: `[CropBid security] ${title}`,
    text:
      `${message}\n\n` +
      'If this could be a breach of personal data, log it now at /admin/incidents: ' +
      'the Data Protection Board must be told within 72 hours of us becoming aware. ' +
      'docs/breach-runbook.md has the steps.',
  }).catch((err) => console.error('[security] alert email failed:', err?.message || err));

  console.warn(`[security] ${kind}: ${message}`);
  return true;
}

/** Call on every wrong password. Alerts on a platform-wide burst. */
export function recordFailedSignIn(now = Date.now()): void {
  const { count, windowMs } = THRESHOLDS.failedSignIns;
  failedSignIns = failedSignIns.filter((t) => now - t < windowMs);
  failedSignIns.push(now);
  if (failedSignIns.length < count) return;
  void raise(
    'FAILED_SIGNIN_BURST',
    'platform',
    'Unusual number of failed sign-ins',
    `${failedSignIns.length} wrong passwords in the last ${windowMs / 60_000} minutes across the platform. ` +
      'This is the pattern of someone trying leaked passwords against our accounts.',
    now,
  ).catch((err) => console.error('[security]', err));
}

async function countByActor(actorId: string, action: string, windowMs: number, now: number): Promise<number> {
  return prisma.auditLog.count({
    where: { actorId, action, createdAt: { gte: new Date(now - windowMs) } },
  });
}

/** Call after an admin's payout-details read has been audited. */
export async function checkPayoutReadVolume(adminId: string, now = Date.now()): Promise<void> {
  try {
    const { count, windowMs } = THRESHOLDS.payoutReads;
    const reads = await countByActor(adminId, 'seller.payout_details.viewed', windowMs, now);
    if (reads < count) return;
    await raise(
      'PAYOUT_READ_VOLUME',
      adminId,
      'An admin opened many sellers’ bank details',
      `Admin account ${adminId} has opened payout details for ${reads} sellers in the last hour. ` +
        'If nobody on the team is making that many payouts, treat the account as compromised: reset its password.',
      now,
    );
  } catch (err) {
    console.error('[security]', err);
  }
}

/** Call after an admin's password reset has been audited. */
export async function checkPasswordResetVolume(adminId: string, now = Date.now()): Promise<void> {
  try {
    const { count, windowMs } = THRESHOLDS.passwordResets;
    const resets = await countByActor(adminId, 'admin.user.password_reset', windowMs, now);
    if (resets < count) return;
    await raise(
      'PASSWORD_RESET_VOLUME',
      adminId,
      'An admin reset many passwords',
      `Admin account ${adminId} has reset ${resets} users’ passwords in the last hour. ` +
        'Each reset hands that account to whoever reads out the temporary password.',
      now,
    );
  } catch (err) {
    console.error('[security]', err);
  }
}
