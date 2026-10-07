// =============================================================================
// What a partner application must carry (decided 2026-10-07)
// =============================================================================
// Every seller and every business buyer gives a PAN, because tax on what they
// sell through the platform is reported against it. Beyond that it depends on
// what they are: a shop sells food (FSSAI), a wholesaler is GST-registered,
// a restaurant, processor or FMCG buyer handles food (FSSAI), and an exporter
// cannot export without an IEC. Each number is checked for shape on the way
// in, and a PAN must be the one inside the GSTIN beside it.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    farmerProfile: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(({ data }: { data: object }) => Promise.resolve({ id: 'fp-1', ...data })),
    },
    buyerProfile: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(({ data }: { data: object }) => Promise.resolve({ id: 'bp-1', ...data })),
      update: vi.fn(),
    },
    $transaction: vi.fn(() => Promise.resolve([])),
  };
  return { prisma };
});
vi.mock('./audit.service', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../lib/prisma';
import { completeBuyerOnboarding, completeFarmerOnboarding, updateBuyerProfile } from './auth.service';

const db = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  farmerProfile: { create: ReturnType<typeof vi.fn> };
  buyerProfile: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const PAN = 'ABCDE1234F';
const GSTIN = '27ABCDE1234F1Z5';

const farm = { sellerType: 'FARMER' as const, farmSizeAcres: 4, cropsGrown: ['Onion'], state: 'Maharashtra' };
const shop = { sellerType: 'LOCAL_SHOP' as const, businessName: 'Sai Kirana', shopType: 'KIRANA', address: 'Sitabuldi', state: 'Maharashtra' };
const wholesaler = { sellerType: 'WHOLESALER' as const, businessName: 'Patil Traders', state: 'Maharashtra' };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CONSUMER', country: 'India' });
});

describe('seller application', () => {
  it('refuses any seller without a PAN, a farm included', async () => {
    await expect(completeFarmerOnboarding('u-1', farm)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('PAN') });
    expect(db.farmerProfile.create).not.toHaveBeenCalled();
  });

  it('takes a farm with a PAN and nothing else, stored in its canonical form', async () => {
    await completeFarmerOnboarding('u-1', { ...farm, pan: 'abcde 1234f' });
    expect(db.farmerProfile.create.mock.calls[0][0].data).toMatchObject({ pan: PAN, gstin: null, fssaiLicense: null });
  });

  it('refuses a malformed PAN', async () => {
    await expect(completeFarmerOnboarding('u-1', { ...farm, pan: 'ABCD1234F' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a shop without an FSSAI number, and one that is not 14 digits', async () => {
    await expect(completeFarmerOnboarding('u-1', { ...shop, pan: PAN })).rejects.toMatchObject({ message: expect.stringContaining('FSSAI') });
    await expect(completeFarmerOnboarding('u-1', { ...shop, pan: PAN, fssaiLicense: '1234' })).rejects.toMatchObject({ message: expect.stringContaining('14 digits') });
    await completeFarmerOnboarding('u-1', { ...shop, pan: PAN, fssaiLicense: '115 2302 0001 234' });
    expect(db.farmerProfile.create.mock.calls[0][0].data.fssaiLicense).toBe('11523020001234');
  });

  it('refuses a wholesaler without a GSTIN, or with one issued to another PAN', async () => {
    await expect(completeFarmerOnboarding('u-1', { ...wholesaler, pan: PAN })).rejects.toMatchObject({ message: expect.stringContaining('GSTIN') });
    await expect(completeFarmerOnboarding('u-1', { ...wholesaler, pan: 'ZZZZZ9999Z', gstin: GSTIN })).rejects.toMatchObject({ message: expect.stringContaining('do not match') });
    await completeFarmerOnboarding('u-1', { ...wholesaler, pan: PAN, gstin: GSTIN.toLowerCase() });
    expect(db.farmerProfile.create.mock.calls[0][0].data).toMatchObject({ pan: PAN, gstin: GSTIN });
  });
});

describe('buyer application', () => {
  const buyer = (companyType: Parameters<typeof completeBuyerOnboarding>[1]['companyType'], extra = {}) =>
    ({ companyName: 'Acme Foods', companyType, ...extra });

  it('refuses every business type without a PAN', async () => {
    await expect(completeBuyerOnboarding('u-1', buyer('RETAILER'))).rejects.toMatchObject({ message: expect.stringContaining('PAN') });
    expect(db.buyerProfile.create).not.toHaveBeenCalled();
  });

  it('takes a retailer with a PAN alone, the GSTIN optional', async () => {
    await completeBuyerOnboarding('u-1', buyer('RETAILER', { pan: PAN }));
    expect(db.buyerProfile.create.mock.calls[0][0].data).toMatchObject({ pan: PAN, taxId: null, fssaiLicense: null, iecCode: null });
  });

  it.each(['RESTAURANT', 'PROCESSOR', 'FMCG'] as const)('refuses a %s without an FSSAI number', async (type) => {
    await expect(completeBuyerOnboarding('u-1', buyer(type, { pan: PAN }))).rejects.toMatchObject({ message: expect.stringContaining('FSSAI') });
  });

  it('refuses an exporter without an IEC', async () => {
    await expect(completeBuyerOnboarding('u-1', buyer('EXPORTER', { pan: PAN }))).rejects.toMatchObject({ message: expect.stringContaining('IEC') });
    await completeBuyerOnboarding('u-1', buyer('EXPORTER', { pan: PAN, iecCode: PAN }));
    expect(db.buyerProfile.create.mock.calls[0][0].data.iecCode).toBe(PAN);
  });

  it('refuses a GSTIN that is malformed or carries a different PAN', async () => {
    await expect(completeBuyerOnboarding('u-1', buyer('RETAILER', { pan: PAN, taxId: '27ABC' }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(completeBuyerOnboarding('u-1', buyer('RETAILER', { pan: 'ZZZZZ9999Z', taxId: GSTIN }))).rejects.toMatchObject({ message: expect.stringContaining('do not match') });
  });
});

describe('editing a buyer profile', () => {
  const approved = (profile: object) => ({
    id: 'u-1', role: 'BUYER',
    buyerProfile: { companyType: 'RETAILER', pan: PAN, fssaiLicense: null, iecCode: null, ...profile },
  });

  it('will not switch to a food business without an FSSAI number on file', async () => {
    db.user.findUnique.mockResolvedValue(approved({}));
    await expect(updateBuyerProfile('u-1', { companyType: 'RESTAURANT' })).rejects.toMatchObject({ message: expect.stringContaining('FSSAI') });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('will not switch to exporter without an IEC on file', async () => {
    db.user.findUnique.mockResolvedValue(approved({}));
    await expect(updateBuyerProfile('u-1', { companyType: 'EXPORTER' })).rejects.toMatchObject({ message: expect.stringContaining('IEC') });
  });

  // Settings posts the saved tax number back on every save, and older
  // applications took any tax number, so an untouched one is left alone.
  it('lets a buyer with a legacy tax number save other changes', async () => {
    db.user.findUnique.mockResolvedValue(approved({ taxId: '12-3456789' }));
    await updateBuyerProfile('u-1', { name: 'New Name', taxId: '12-3456789' });
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('checks a GSTIN typed into the profile like one on the application', async () => {
    db.user.findUnique.mockResolvedValue(approved({}));
    await expect(updateBuyerProfile('u-1', { taxId: 'not a gstin' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateBuyerProfile('u-1', { taxId: '29ZZZZZ9999Z1Z5' })).rejects.toMatchObject({ message: expect.stringContaining('do not match') });
  });
});
