// =============================================================================
// Finding an account by its phone number on Admin → Users
// =============================================================================
// Support is rung by people, and a phone-only account has no email to search
// for. Numbers are stored as typed, so the same person can be `9822055667` or
// `+919822055667` (CLAUDE.md §4); the search has to find either from either.
// Against a real Postgres, because the match is a Prisma `contains`.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { getUsers, phoneSearchDigits } from './admin.service';

const BARE = 'adm-search-bare';
const PREFIXED = 'adm-search-prefixed';
const EVERYONE = [BARE, PREFIXED];

async function reset() {
  await prisma.user.deleteMany({ where: { id: { in: EVERYONE } } });
}

beforeAll(async () => {
  await reset();
  await prisma.user.createMany({
    data: [
      { id: BARE, name: 'Search test bare', phone: '9000011122', password: 'x', role: 'CONSUMER' },
      { id: PREFIXED, name: 'Search test prefixed', phone: '+919000033344', password: 'x', role: 'CONSUMER' },
    ],
  });
});

afterAll(reset);

async function found(search: string) {
  const { users } = await getUsers(search);
  return users.map((u) => u.id).filter((id) => EVERYONE.includes(id)).sort();
}

describe('phoneSearchDigits', () => {
  it('reduces a typed number to its digits and drops a +91', () => {
    expect(phoneSearchDigits('98220 55667')).toBe('9822055667');
    expect(phoneSearchDigits('+91 98220 55667')).toBe('9822055667');
    expect(phoneSearchDigits('919822055667')).toBe('9822055667');
    expect(phoneSearchDigits('91-98220')).toBe('98220');
  });

  it('leaves a number that merely starts with 91 alone', () => {
    expect(phoneSearchDigits('9198220')).toBe('9198220');
  });

  it('is not a phone search below four digits', () => {
    expect(phoneSearchDigits('Ravi')).toBeNull();
    expect(phoneSearchDigits('Ward 3')).toBeNull();
  });
});

describe('getUsers search by phone', () => {
  it('finds a number stored without a country code, typed with one', async () => {
    expect(await found('+91 90000 11122')).toEqual([BARE]);
  });

  it('finds a number stored with a country code, typed without one', async () => {
    expect(await found('90000 33344')).toEqual([PREFIXED]);
  });

  it('finds on part of a number', async () => {
    expect(await found('900003')).toEqual([PREFIXED]);
  });

  it('returns the phone on each row', async () => {
    const { users } = await getUsers('9000011122');
    expect(users.find((u) => u.id === BARE)?.phone).toBe('9000011122');
  });

  it('still searches by name', async () => {
    expect(await found('Search test')).toEqual([BARE, PREFIXED]);
  });
});
