// =============================================================================
// The boot sweep: nothing is left in the clear after a deploy
// =============================================================================
// The migration clears the column, but a deploy applies migrations and THEN
// swaps the API, so the old code keeps serving for a moment and a sign-in in
// that window writes a raw token into a column that was just emptied. The new
// code sweeps on boot, which is after the swap by definition.
//
// Runs against a real Postgres, because the whole thing is one UPDATE with a
// regex in it: a mocked client would only prove this file calls itself. What
// has to hold is that it clears what is not a digest, keeps what is, and does
// nothing at all on an ordinary boot.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { generateTokens } from './jwt';
import { clearPlaintextRefreshTokens, hashRefreshToken } from './refreshToken';

const HASHED = 'sweep-user-hashed';
const PLAINTEXT = 'sweep-user-plaintext';
const EMPTY = 'sweep-user-empty';
const ALL = [HASHED, PLAINTEXT, EMPTY];

// A real token, signed here rather than pasted in: it is long, dotted and not
// hex, which is exactly why the digest-shaped test catches it. Minted at run
// time on purpose, because a JWT literal in a source file is a secret as far
// as any scanner is concerned, and ours says so.
const RAW_TOKEN = generateTokens('sweep-user', 'CONSUMER').refreshToken;
const HASH = hashRefreshToken(RAW_TOKEN);

async function seed(id: string, refreshToken: string | null) {
  await prisma.user.create({
    data: { id, name: id, email: `${id}@test.local`, password: 'x', role: 'CONSUMER', refreshToken },
  });
}

const tokenOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { refreshToken: true } })).refreshToken;

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
  await seed(HASHED, HASH);
  await seed(PLAINTEXT, RAW_TOKEN);
  await seed(EMPTY, null);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
});

describe('clearing refresh tokens left in the clear', () => {
  it('clears a raw token and leaves a digest alone', async () => {
    const cleared = await clearPlaintextRefreshTokens();

    expect(cleared).toBe(1);
    expect(await tokenOf(PLAINTEXT)).toBeNull();
    expect(await tokenOf(HASHED)).toBe(HASH);
    expect(await tokenOf(EMPTY)).toBeNull();
  });

  // Every boot after the first, and every boot on an installation that never
  // held a raw token: it must touch nothing.
  it('does nothing on an ordinary boot', async () => {
    await clearPlaintextRefreshTokens();

    const cleared = await clearPlaintextRefreshTokens();

    expect(cleared).toBe(0);
    expect(await tokenOf(HASHED)).toBe(HASH);
  });

  // The shape test is what decides, so anything that is not 64 hex characters
  // goes: a truncated digest, a token that happens to be hex, an empty string.
  it('clears anything that is not a full digest', async () => {
    await prisma.user.update({ where: { id: PLAINTEXT }, data: { refreshToken: HASH.slice(0, 63) } });
    expect(await clearPlaintextRefreshTokens()).toBe(1);

    await prisma.user.update({ where: { id: PLAINTEXT }, data: { refreshToken: `${HASH}extra` } });
    expect(await clearPlaintextRefreshTokens()).toBe(1);

    await prisma.user.update({ where: { id: PLAINTEXT }, data: { refreshToken: '' } });
    expect(await clearPlaintextRefreshTokens()).toBe(1);
  });
});
