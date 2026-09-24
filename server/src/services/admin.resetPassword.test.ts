// =============================================================================
// An admin resets the password of somebody who called in locked out
// =============================================================================
// The account that rings support is usually the one forgot-password cannot
// help: a phone-only account has no email to send a link to. So an admin sets
// a temporary password and reads it out. What has to hold:
//
//   1. The plaintext comes back exactly once, and the column holds a hash of
//      it, not the password.
//   2. The user can sign in with it, and that session owes a password change.
//   3. Until they change it, the session can do nothing else: the token says
//      so and the middleware refuses.
//   4. Changing the password ends it, and does not ask for the temporary one,
//      which somebody signing in by phone code never knew.
//   5. Every session the account had is over, and any emailed reset link with
//      it.
//   6. Not another admin, and not yourself.
//   7. The reset and its audit row commit together, so neither a reset with no
//      record nor a record of a reset that did not happen can exist.
//   8. A token from BEFORE the reset does not inherit the exception, which is
//      the takeover review caught: support resets an account precisely when
//      somebody may be holding a session they should not.
//   9. A sign-in racing the reset cannot put its session back over it.
//
// Against a real Postgres, because what is being pinned is what the next
// sign-in does with the row this wrote.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { resetUserPassword } from './admin.service';
import { changePassword, login } from './auth.service';
import { verifyAccessToken } from '../utils/jwt';

const ADMIN = 'reset-admin';
const OTHER_ADMIN = 'reset-admin-2';
const USER = 'reset-user';
const EVERYONE = [ADMIN, OTHER_ADMIN, USER];

const EMAIL = `${USER}@test.local`;
const OLD_PASSWORD = 'theOldOne!2026';

async function reset() {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: EVERYONE } } });
  await prisma.user.deleteMany({ where: { id: { in: EVERYONE } } });
}

beforeEach(async () => {
  await reset();
  await prisma.user.createMany({
    data: [
      { id: ADMIN, name: 'Ops', email: `${ADMIN}@test.local`, password: 'x', role: 'ADMIN' },
      { id: OTHER_ADMIN, name: 'Ops two', email: `${OTHER_ADMIN}@test.local`, password: 'x', role: 'ADMIN' },
      {
        id: USER,
        name: 'Locked out',
        email: EMAIL,
        password: await bcrypt.hash(OLD_PASSWORD, 12),
        role: 'CONSUMER',
        refreshToken: 'a-live-session',
        passwordResetToken: 'an-emailed-link',
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    ],
  });
});

afterAll(reset);

const row = () => prisma.user.findUniqueOrThrow({ where: { id: USER } });

describe('resetting a password', () => {
  it('returns the temporary password once and stores only its hash', async () => {
    const { tempPassword } = await resetUserPassword(ADMIN, USER);

    expect(tempPassword).toMatch(/^[a-z34679]{4}-[a-z34679]{4}-[a-z34679]{4}$/);

    const after = await row();
    expect(after.password).not.toBe(tempPassword);
    expect(await bcrypt.compare(tempPassword, after.password!)).toBe(true);
    // The old one is gone, which is the point of the call.
    expect(await bcrypt.compare(OLD_PASSWORD, after.password!)).toBe(false);
  });

  it('ends every session the account had, and any emailed link', async () => {
    await resetUserPassword(ADMIN, USER);

    const after = await row();
    expect(after.refreshToken).toBeNull();
    expect(after.passwordResetToken).toBeNull();
    expect(after.passwordResetExpires).toBeNull();
  });

  it('writes an audit row that names who did it, and never the password', async () => {
    const { tempPassword } = await resetUserPassword(ADMIN, USER);

    const [log] = await prisma.auditLog.findMany({ where: { actorId: ADMIN } });
    expect(log.action).toBe('admin.user.password_reset');
    expect(log.entityId).toBe(USER);
    expect(JSON.stringify(log.metadata)).not.toContain(tempPassword);
  });

  it('refuses another admin, and yourself', async () => {
    await expect(resetUserPassword(ADMIN, OTHER_ADMIN)).rejects.toMatchObject({ statusCode: 403 });
    await expect(resetUserPassword(ADMIN, ADMIN)).rejects.toMatchObject({ statusCode: 400 });

    // Neither attempt touched a password.
    const other = await prisma.user.findUniqueOrThrow({ where: { id: OTHER_ADMIN } });
    expect(other.password).toBe('x');
  });

  it('leaves no audit row when the reset itself cannot be written', async () => {
    // The account goes between the lookup and the write, which is what makes
    // the update fail. Before this was one transaction, the log kept a record
    // of a reset that never happened.
    const doomed = 'reset-doomed';
    await prisma.user.create({
      data: { id: doomed, name: 'Gone', email: `${doomed}@test.local`, password: 'x', role: 'CONSUMER' },
    });
    const started = resetUserPassword(ADMIN, doomed);
    await prisma.user.delete({ where: { id: doomed } });

    await expect(started).rejects.toBeTruthy();
    expect(await prisma.auditLog.count({ where: { entityId: doomed } })).toBe(0);
  });

  it('gives a different password every time', async () => {
    const first = await resetUserPassword(ADMIN, USER);
    const second = await resetUserPassword(ADMIN, USER);
    expect(first.tempPassword).not.toBe(second.tempPassword);
  });
});

// The reset path is the only one that does not ask for the current password,
// and the request schema no longer requires one, so this is the edge worth
// pinning: an ordinary account is still held to it.
describe('an account nobody reset', () => {
  it('cannot change its password without the current one', async () => {
    await expect(changePassword(USER, '', 'somethingElse!2026'))
      .rejects.toMatchObject({ statusCode: 401 });
    await expect(changePassword(USER, 'not-the-password', 'somethingElse!2026'))
      .rejects.toMatchObject({ statusCode: 401 });

    // Still the password it started with.
    expect(await bcrypt.compare(OLD_PASSWORD, (await row()).password!)).toBe(true);
  });
});

// The exception belongs to the SESSION, not to the account. A token minted
// before the reset is valid for another five minutes and carries no claim, so
// whoever holds it must still prove the password to change it, and the one
// they know was just replaced.
describe('a session from before the reset', () => {
  it('cannot skip the current password, even though the row says a change is owed', async () => {
    await resetUserPassword(ADMIN, USER);

    // viaResetSession false is what authenticate passes for a token with no
    // such claim.
    await expect(changePassword(USER, '', 'takenOver!2026', false))
      .rejects.toMatchObject({ statusCode: 401 });
    await expect(changePassword(USER, OLD_PASSWORD, 'takenOver!2026', false))
      .rejects.toMatchObject({ statusCode: 401 });

    expect((await row()).mustChangePassword).toBe(true);
  });
});

// The reset reads, then writes. A sign-in that read the account first must not
// be able to write its session back afterwards.
describe('a sign-in racing the reset', () => {
  // The window is between login verifying the password and writing its session.
  // Calling resetUserPassword here would hash a password of its own first, and
  // which of the two landed first came down to the clock: the test passed and
  // failed by turns. So the reset's WRITE is made directly, once the sign-in is
  // known to be inside bcrypt, which is where the window is. Five rounds,
  // because a race test that has never been watched to fail proves nothing.
  it('is refused rather than reinstating the session it was about to get', async () => {
    const replacement = await bcrypt.hash('support-issued', 12);

    for (let round = 0; round < 5; round++) {
      await prisma.user.update({
        where: { id: USER },
        data: {
          password: await bcrypt.hash(OLD_PASSWORD, 12),
          refreshToken: 'a-live-session',
          mustChangePassword: false,
        },
      });

      const signIn = login({ identifier: EMAIL, password: OLD_PASSWORD });
      // Long enough to be inside the compare, far short of it finishing.
      await new Promise((r) => setTimeout(r, 40));
      await prisma.user.update({
        where: { id: USER },
        data: { password: replacement, refreshToken: null, mustChangePassword: true },
      });

      await expect(signIn).rejects.toMatchObject({ statusCode: 401 });

      // The revocation stands: no session was written back over it.
      expect((await row()).refreshToken).toBeNull();
    }
  }, 30000);
});

// A flagged token outlives its own change by up to five minutes. If support
// resets the account again inside that window, the old token must not be able
// to skip the check a second time: it is proof of the first reset, not this one.
describe('a token from an earlier reset', () => {
  it('cannot skip the check after a second reset', async () => {
    await resetUserPassword(ADMIN, USER);
    const firstResetAt = (await row()).passwordResetAt!.getTime();
    await changePassword(USER, '', 'chosenOnce!2026', true, firstResetAt);

    // Support resets again a moment later.
    await resetUserPassword(ADMIN, USER);

    await expect(changePassword(USER, '', 'takenOver!2026', true, firstResetAt))
      .rejects.toMatchObject({ statusCode: 401 });

    // The session the SECOND reset minted is the one that may.
    const secondResetAt = (await row()).passwordResetAt!.getTime();
    await expect(changePassword(USER, '', 'chosenAgain!2026', true, secondResetAt))
      .resolves.toBeTruthy();
  });
});

describe('the session the temporary password buys', () => {
  it('signs in, and owes a password change', async () => {
    const { tempPassword } = await resetUserPassword(ADMIN, USER);

    const session = await login({ identifier: EMAIL, password: tempPassword });

    expect(session.user.mustChangePassword).toBe(true);
    // The middleware reads this claim, so it is what the gate is made of.
    expect(verifyAccessToken(session.accessToken).mustChangePassword).toBe(true);
  });

  it('refuses the password that was replaced', async () => {
    await resetUserPassword(ADMIN, USER);
    await expect(login({ identifier: EMAIL, password: OLD_PASSWORD }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  // The temporary password is not asked for again: whoever is here either
  // typed it a moment ago or came in by phone code and never knew it.
  it('is spent by changing the password, which mints a clean token', async () => {
    const { tempPassword } = await resetUserPassword(ADMIN, USER);
    await login({ identifier: EMAIL, password: tempPassword });

    // What authenticate passes for a token minted by that sign-in: the claim,
    // and the stamp of the reset it belongs to. Only that pair may skip the
    // current password.
    const resetAt = (await row()).passwordResetAt!.getTime();
    const tokens = await changePassword(USER, '', 'myOwnPassword!2026', true, resetAt);

    expect(verifyAccessToken(tokens.accessToken).mustChangePassword).toBeUndefined();
    expect((await row()).mustChangePassword).toBe(false);

    const session = await login({ identifier: EMAIL, password: 'myOwnPassword!2026' });
    expect(session.user.mustChangePassword).toBe(false);
    expect(verifyAccessToken(session.accessToken).mustChangePassword).toBeUndefined();
  });
});
