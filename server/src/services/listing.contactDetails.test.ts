// =============================================================================
// Contact details in a listing's crop name or variety
// =============================================================================
// Every buyer reads a lot's crop name and variety, so they are held to the
// same rule as its description (CLAUDE.md section 2d): no phone, email or chat
// link. What has to hold, on create and on edit: the service refuses before it
// reads or writes anything, and a clean name still goes through to the
// database.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    farmerProfile: { findUnique: vi.fn(async () => null) },
    listing: {
      create: vi.fn(),
      findUnique: vi.fn(async () => null),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { createListing, updateListing } from './listing.service';

const BASE = {
  cropName: 'Wheat',
  quantity: 50,
  qualityGrade: 'A' as const,
  pricePerUnitMin: 2200,
  pricePerUnitMax: 2500,
  location: 'Nagpur',
  state: 'Maharashtra',
};

const DIRTY: Array<[string, Record<string, string>]> = [
  ['a phone number in the crop name', { cropName: 'Wheat call 98220 55667' }],
  ['an email in the crop name', { cropName: 'Wheat seller@example.com' }],
  ['a phone number in the variety', { cropVariety: 'Pusa 1121 whatsapp 9822055667' }],
  ['a WhatsApp link in the variety', { cropVariety: 'see wa.me/919822055667' }],
];

beforeEach(() => vi.clearAllMocks());

function expectNothingTouched() {
  expect(prisma.farmerProfile.findUnique).not.toHaveBeenCalled();
  expect(prisma.listing.findUnique).not.toHaveBeenCalled();
  expect(prisma.listing.create).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

describe('creating a listing', () => {
  it.each(DIRTY)('refuses %s before touching the database', async (_label, change) => {
    await expect(createListing('u1', { ...BASE, ...change } as any)).rejects.toMatchObject({
      statusCode: 400,
    });
    expectNothingTouched();
  });

  it('lets a clean crop name and variety through to the database', async () => {
    // No seller profile in the mock, so it stops there; what matters is that
    // the contact check let it reach the database.
    await expect(createListing('u1', { ...BASE, cropVariety: 'Pusa 1121' } as any)).rejects.toThrow();
    expect(prisma.farmerProfile.findUnique).toHaveBeenCalled();
  });
});

describe('editing a listing', () => {
  it.each(DIRTY)('refuses %s before touching the database', async (_label, change) => {
    await expect(updateListing('l1', 'u1', change as any)).rejects.toMatchObject({ statusCode: 400 });
    expectNothingTouched();
  });

  it('lets a clean crop name and variety through to the database', async () => {
    await expect(updateListing('l1', 'u1', { cropName: 'Rice', cropVariety: 'Basmati' } as any)).rejects.toThrow();
    expect(prisma.listing.findUnique).toHaveBeenCalled();
  });
});
