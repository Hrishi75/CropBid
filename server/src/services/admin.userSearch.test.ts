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
const PUNCTUATED = 'adm-search-punctuated';
const NUMBERED = 'adm-search-numbered';
const HAS_2026 = 'adm-search-has-2026';
const EVERYONE = [BARE, PREFIXED, PUNCTUATED, NUMBERED, HAS_2026];

async function reset() {
  await prisma.user.deleteMany({ where: { id: { in: EVERYONE } } });
}

beforeAll(async () => {
  await reset();
  await prisma.user.createMany({
    data: [
      { id: BARE, name: 'Search test bare', phone: '9000011122', password: 'x', role: 'CONSUMER' },
      { id: PREFIXED, name: 'Search test prefixed', phone: '+919000033344', password: 'x', role: 'CONSUMER' },
      // The profile editor stores the number as typed, punctuation included.
      { id: PUNCTUATED, name: 'Search test punctuated', phone: '(90000) 55-566', password: 'x', role: 'CONSUMER' },
      // A name with digits in it, and somebody else whose number holds them.
      { id: NUMBERED, name: 'Search test Ward 2026', phone: '9000000001', password: 'x', role: 'CONSUMER' },
      { id: HAS_2026, name: 'Search test other', phone: '9000202600', password: 'x', role: 'CONSUMER' },
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
    expect(phoneSearchDigits('91.98220')).toBe('98220');
    expect(phoneSearchDigits('91/98220')).toBe('98220');
  });

  it('leaves a number that merely starts with 91 alone', () => {
    expect(phoneSearchDigits('9198220')).toBe('9198220');
  });

  it('is not a phone search when the text is not a phone number', () => {
    expect(phoneSearchDigits('Ward 2026')).toBeNull();
    expect(phoneSearchDigits('user2026@example.com')).toBeNull();
    expect(phoneSearchDigits('वार्ड 2026')).toBeNull();
  });

  it('reads a number pasted with any punctuation the profile editor kept', () => {
    expect(phoneSearchDigits('98220.55667')).toBe('9822055667');
    expect(phoneSearchDigits('98220/55667')).toBe('9822055667');
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

  it('finds a number stored with punctuation, typed without it', async () => {
    expect(await found('9000055566')).toEqual([PUNCTUATED]);
  });

  it('does not match a number against the digits in a name', async () => {
    // One account has 2026 in its name, another in its number. Only the name
    // is meant.
    expect(await found('Ward 2026')).toEqual([NUMBERED]);
  });

  it('finds on part of a number', async () => {
    expect(await found('900003')).toEqual([PREFIXED]);
  });

  it('returns the phone on each row', async () => {
    const { users } = await getUsers('9000011122');
    expect(users.find((u) => u.id === BARE)?.phone).toBe('9000011122');
  });

  it('still searches by name', async () => {
    expect(await found('Search test')).toEqual([...EVERYONE].sort());
  });
});
