// =============================================================================
// Agri-input enquiries: one lead per account per product
// =============================================================================
// An enquiry is the only request that returns a shop's phone number. The
// properties that have to hold:
//   1. The first enquiry writes a lead and hands over the number.
//   2. A repeat, including a twin racing the first, writes nothing more and
//      gets back the lead already on file, number included.
//   3. Any other database error comes back out rather than being answered
//      with a lead.
//   4. A product the licence gate hides cannot be enquired on by id, and
//      nothing is written for it.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    agriInput: { findFirst: vi.fn() },
    agriInputEnquiry: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
  },
}));

import { Prisma } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { createEnquiry } from './agriInput.service';

const findProduct = prisma.agriInput.findFirst as unknown as ReturnType<typeof vi.fn>;
const createLead = prisma.agriInputEnquiry.create as unknown as ReturnType<typeof vi.fn>;
const findLead = prisma.agriInputEnquiry.findUniqueOrThrow as unknown as ReturnType<typeof vi.fn>;

const USER = 'farmer-1';

const PRODUCT = {
  id: 'input-1',
  category: 'SEED',
  supplier: {
    name: 'Sahyadri Krishi Kendra',
    location: 'Pune',
    state: 'Maharashtra',
    contactPhone: '+91 98220 41567',
    contactEmail: null,
    verified: true,
    seedLicence: 'MH/PUN/SEED/2019/4471',
    fertiliserLicence: null,
    pesticideLicence: null,
  },
};

const EXISTING_LEAD = { id: 'enquiry-original', agriInputId: PRODUCT.id, userId: USER };

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { modelName: 'AgriInputEnquiry' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findProduct.mockResolvedValue(PRODUCT);
  createLead.mockResolvedValue({ id: 'enquiry-new', agriInputId: PRODUCT.id, userId: USER });
  findLead.mockResolvedValue(EXISTING_LEAD);
});

describe('createEnquiry: first time', () => {
  it('writes a lead and hands over the number', async () => {
    const result = await createEnquiry(PRODUCT.id, USER, { packQuantity: 2 });

    expect(result.created).toBe(true);
    expect(result.enquiry).toMatchObject({ id: 'enquiry-new' });
    expect(result.supplier.contactPhone).toBe(PRODUCT.supplier.contactPhone);
    expect(findLead).not.toHaveBeenCalled();
  });

  // The number is the payoff; the licence NUMBER is a document reference that
  // stays on the server even here.
  it('says which licences the shop holds without publishing any of them', async () => {
    const result = await createEnquiry(PRODUCT.id, USER, {});

    expect(result.supplier.licences).toEqual({ seed: true, fertiliser: false, pesticide: false });
    expect(JSON.stringify(result)).not.toContain(PRODUCT.supplier.seedLicence);
  });
});

describe('createEnquiry: asking again', () => {
  it('gets the lead already on file and writes nothing more', async () => {
    createLead.mockRejectedValue(uniqueViolation());

    const result = await createEnquiry(PRODUCT.id, USER, { message: 'still need 10 packets' });

    expect(result.created).toBe(false);
    expect(result.enquiry).toBe(EXISTING_LEAD);
    // They earned the number the first time.
    expect(result.supplier.contactPhone).toBe(PRODUCT.supplier.contactPhone);
    expect(createLead).toHaveBeenCalledTimes(1);
  });

  // Handing back someone else's lead would tell this caller what another
  // farmer asked for.
  it('looks the existing lead up scoped to the caller', async () => {
    createLead.mockRejectedValue(uniqueViolation());

    await createEnquiry(PRODUCT.id, USER, {});

    expect(findLead).toHaveBeenCalledWith({
      where: { userId_agriInputId: { userId: USER, agriInputId: PRODUCT.id } },
    });
  });

  it('rethrows any other database error', async () => {
    const outage = new Error('connection reset');
    createLead.mockRejectedValue(outage);

    await expect(createEnquiry(PRODUCT.id, USER, {})).rejects.toBe(outage);
    expect(findLead).not.toHaveBeenCalled();
  });
});

describe('createEnquiry: the licence gate', () => {
  it('refuses a product the gate hides, and writes nothing', async () => {
    findProduct.mockResolvedValue(null);

    await expect(createEnquiry(PRODUCT.id, USER, {})).rejects.toMatchObject({ statusCode: 404 });
    expect(createLead).not.toHaveBeenCalled();
  });

  // The lookup has to carry the gate. A findUnique by id would let a guessed
  // id through, and the gate would be cosmetic.
  it('fetches the product through the licence filter, not by id alone', async () => {
    await createEnquiry(PRODUCT.id, USER, {});

    const where = findProduct.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ id: PRODUCT.id });
    expect(where.AND[1]).toMatchObject({ active: true, supplier: { active: true } });
    expect(where.AND[1].OR).toContainEqual({ category: 'SEED', supplier: { seedLicence: { not: null } } });
  });
});
