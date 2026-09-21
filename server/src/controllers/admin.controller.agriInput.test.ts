// =============================================================================
// What the admin inputs forms may send
// =============================================================================
// The service holds the product rules and the licence rule. These are the
// request-shape ones in front of it: that "I have seen the document" is never
// assumed, that a blank field on an edit means clear and an absent one means
// leave, and that a shop cannot be moved to another state by editing it.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  createProductSchema,
  createSupplierSchema,
  licenceSchema,
  updateAgriInputSupplier,
  updateProductSchema,
} from './admin.controller';

describe('licenceSchema', () => {
  it('never assumes the admin has seen the document', () => {
    expect(licenceSchema.parse({ seed: 'MH/PUN/SEED/2019/4471' }).paperworkSeen).toBe(false);
  });

  it('takes a number as printed, and null as clear', () => {
    expect(licenceSchema.safeParse({ seed: ' MH/PUN/SEED/2019/4471 ' }).data?.seed).toBe('MH/PUN/SEED/2019/4471');
    expect(licenceSchema.safeParse({ fertiliser: 'FCO-12.34 A' }).success).toBe(true);
    expect(licenceSchema.safeParse({ pesticide: null }).data?.pesticide).toBeNull();
  });

  it('refuses something that is not a licence number', () => {
    for (const bad of ['ab', '<b>4471</b>', '/leading-slash', 'x'.repeat(61)]) {
      expect(licenceSchema.safeParse({ seed: bad }).success, bad).toBe(false);
    }
  });
});

describe('createSupplierSchema', () => {
  const shop = { name: 'Sahyadri Krishi Kendra', location: 'Pune', state: 'Maharashtra' };

  it('wants a phone number a farmer can call', () => {
    expect(createSupplierSchema.safeParse({ ...shop, contactPhone: '+91 98220 41567' }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ ...shop, contactPhone: '9822041567' }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ ...shop, contactPhone: '12345' }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...shop }).success).toBe(false);
  });

  it('reads a blank email as none', () => {
    const parsed = createSupplierSchema.parse({ ...shop, contactPhone: '9822041567', contactEmail: '' });
    expect(parsed.contactEmail).toBeNull();
    expect(createSupplierSchema.safeParse({ ...shop, contactPhone: '9822041567', contactEmail: 'nope' }).success)
      .toBe(false);
  });
});

describe('product schemas', () => {
  it('fills in the optional lists on a new product', () => {
    const parsed = createProductSchema.parse({
      supplierId: '6f1c1f9e-3c1a-4c55-9d7a-2f1c9a0e7b11',
      title: 'Urea 46% N',
      category: 'FERTILISER',
      packSize: '45 kg bag',
      pricePerPack: 266.5,
    });
    expect(parsed).toMatchObject({ subsidised: false, specs: [], cropNames: [] });
  });

  it('on an edit, clears a blanked field and leaves an absent one alone', () => {
    const parsed = updateProductSchema.parse({ brand: '', pricePerPack: 300 });
    expect(parsed.brand).toBeNull();
    expect(parsed.composition).toBeUndefined();
  });

  it('refuses a price of nothing', () => {
    expect(updateProductSchema.safeParse({ pricePerPack: 0 }).success).toBe(false);
  });
});

describe('updateAgriInputSupplier', () => {
  it('refuses to move a shop to another state, and says why', async () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
    const next = vi.fn();
    const req = {
      params: { id: '6f1c1f9e-3c1a-4c55-9d7a-2f1c9a0e7b11' },
      body: { state: 'Goa' },
    } as unknown as Request;

    await updateAgriInputSupplier(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].message).toMatch(/cannot change: a licence covers one premises in one state/);
    expect(next).not.toHaveBeenCalled();
  });
});
