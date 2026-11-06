// =============================================================================
// What a listing may contain
// =============================================================================
// Create had no schema: "-5", "abc" and "Infinity" were stored as a negative
// quantity, NaN and Infinity, and a bad unit, grade or date came back as a 500.
// Edit read the string "false" as true and let images point anywhere. What has
// to hold:
//
//   1. A valid multipart create (every field a string) passes and is coerced.
//   2. Every bad number, enum, date or link is a 400 that never reaches the
//      service, on create and on edit.
//   3. Fields the client must not set (status, farmerId, images on edit) are
//      dropped, not stored.
//   4. Contact details in the crop name or variety are refused like the
//      description's.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../services/listing.service', () => ({
  createListing: vi.fn(async (_userId: string, input: Record<string, unknown>) => ({ id: 'l1', ...input })),
  updateListing: vi.fn(async (id: string, _userId: string, input: Record<string, unknown>) => ({ id, ...input })),
}));
vi.mock('../services/translation.service', () => ({ queueListingTranslation: vi.fn() }));

import * as listingService from '../services/listing.service';
import { createListing, updateListing, createListingSchema, updateListingSchema } from './listing.controller';
import { assertNoContactDetails } from '../utils/contactDetails';

// What the web form posts: multipart, so every value is a string.
const FORM = {
  cropName: 'Wheat',
  quantity: '50',
  unit: 'QUINTAL',
  qualityGrade: 'A',
  pricePerUnitMin: '2200',
  pricePerUnitMax: '2500',
  currency: 'INR',
  organic: 'false',
  directSaleEnabled: 'false',
  freightPaidBy: 'FARMER',
  location: 'Nagpur',
  country: 'India',
  state: 'Maharashtra',
};

function call(handler: typeof createListing, body: unknown, params: Record<string, string> = {}) {
  const res: { statusCode?: number; body?: any } = {};
  const response = {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      res.body = payload;
      res.statusCode ??= 200;
      return this;
    },
  } as unknown as Response;
  const req = { body, params, user: { userId: 'u1' } } as unknown as Request;
  const next = vi.fn();
  return handler(req, response, next).then(() => ({ ...res, next }));
}

beforeEach(() => vi.clearAllMocks());

describe('creating a listing', () => {
  it('takes the multipart form, coercing its strings', async () => {
    const r = await call(createListing, { ...FORM, organic: 'true', unit: 'quintal' });
    expect(r.statusCode).toBe(201);
    const input = vi.mocked(listingService.createListing).mock.calls[0][1] as any;
    expect(input).toMatchObject({ quantity: 50, pricePerUnitMin: 2200, unit: 'QUINTAL', organic: true, directSaleEnabled: false });
  });

  it('takes a JSON body with real booleans', async () => {
    const r = await call(createListing, { ...FORM, quantity: 50, organic: true, directSaleEnabled: true, retailPricePerUnit: 30 });
    expect(r.statusCode).toBe(201);
    expect(vi.mocked(listingService.createListing).mock.calls[0][1]).toMatchObject({ organic: true, directSaleEnabled: true, retailPricePerUnit: 30 });
  });

  it('treats a blank retail price as not given', async () => {
    const r = await call(createListing, { ...FORM, retailPricePerUnit: '' });
    expect(r.statusCode).toBe(201);
    expect((vi.mocked(listingService.createListing).mock.calls[0][1] as any).retailPricePerUnit).toBeUndefined();
  });

  it.each([
    ['a negative quantity', { quantity: '-5' }],
    ['a zero quantity', { quantity: '0' }],
    ['a quantity that is not a number', { quantity: 'abc' }],
    ['an infinite quantity', { quantity: 'Infinity' }],
    ['a blank quantity', { quantity: '' }],
    ['a missing quantity', { quantity: undefined }],
    ['an absurd price', { pricePerUnitMax: '1e12' }],
    ['a price that is not a number', { pricePerUnitMin: 'NaN' }],
    ['a negative retail price', { retailPricePerUnit: '-1' }],
    ['an unknown unit', { unit: 'LITRE' }],
    ['an unknown grade', { qualityGrade: 'Z' }],
    ['a missing grade', { qualityGrade: undefined }],
    ['an unknown currency', { currency: 'BTC' }],
    ['a bad date', { harvestDate: 'not-a-date' }],
    ['a word for a boolean', { organic: 'maybe' }],
    ['a missing crop name', { cropName: '   ' }],
    ['a missing town', { location: '' }],
    ['a missing state', { state: undefined }],
    ['a description over 2000 characters', { description: 'x'.repeat(2001) }],
    ['a javascript: lab report link', { labReportUrl: 'javascript:alert(1)' }],
    ['an http lab report link', { labReportUrl: 'http://example.com/report.pdf' }],
    ['an unknown freight payer', { freightPaidBy: 'NOBODY' }],
  ])('refuses %s with a 400, before the service', async (_label, change) => {
    const r = await call(createListing, { ...FORM, ...change });
    expect(r.statusCode).toBe(400);
    expect(typeof r.body.message).toBe('string');
    expect(listingService.createListing).not.toHaveBeenCalled();
  });

  it('drops fields the client must not set', async () => {
    await call(createListing, { ...FORM, status: 'SOLD', farmerId: 'someone-else', isRequirementFill: 'true', images: ['https://evil.example/x.png'] });
    const input = vi.mocked(listingService.createListing).mock.calls[0][1] as any;
    expect(input.status).toBeUndefined();
    expect(input.farmerId).toBeUndefined();
    expect(input.isRequirementFill).toBeUndefined();
    // Only the uploaded files, which here are none.
    expect(input.images).toEqual([]);
  });

  it('accepts an https lab report link', () => {
    expect(createListingSchema.safeParse({ ...FORM, labReportUrl: 'https://lab.example/r.pdf' }).success).toBe(true);
  });
});

describe('editing a listing', () => {
  it('reads the string "false" as false', async () => {
    const r = await call(updateListing, { organic: 'false', directSaleEnabled: 'false' }, { id: 'l1' });
    expect(r.statusCode).toBe(200);
    expect(vi.mocked(listingService.updateListing).mock.calls[0][2]).toEqual({ organic: false, directSaleEnabled: false });
  });

  it('cannot set images, status or the owner', async () => {
    await call(updateListing, { images: ['https://evil.example/x.png'], status: 'SOLD', farmerId: 'x', cropName: 'Rice' }, { id: 'l1' });
    expect(vi.mocked(listingService.updateListing).mock.calls[0][2]).toEqual({ cropName: 'Rice' });
  });

  it.each([
    ['a negative quantity', { quantity: -1 }],
    ['an infinite price', { pricePerUnitMin: 'Infinity' }],
    ['an unknown unit', { unit: 'LITRE' }],
    ['an unknown grade', { qualityGrade: 'Z' }],
    ['a bad expiry date', { expiryDate: '2026-13-45' }],
    ['a blank crop name', { cropName: '' }],
  ])('refuses %s with a 400, before the service', async (_label, body) => {
    const r = await call(updateListing, body, { id: 'l1' });
    expect(r.statusCode).toBe(400);
    expect(listingService.updateListing).not.toHaveBeenCalled();
  });

  it('still clears a variety, date or lab report with a blank', () => {
    const parsed = updateListingSchema.parse({ cropVariety: '', harvestDate: '', labReportUrl: '' });
    expect(parsed).toEqual({ cropVariety: '', harvestDate: '', labReportUrl: '' });
  });
});

describe('contact details in the crop name or variety', () => {
  it('are refused by the same check as the description', () => {
    expect(() => assertNoContactDetails('Wheat call 98220 55667', 'The crop name')).toThrow();
    expect(() => assertNoContactDetails('Pusa 1121', 'The variety')).not.toThrow();
  });
});
