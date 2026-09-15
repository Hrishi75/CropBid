// =============================================================================
// Address Controller — the shopper's own address book
// =============================================================================
// Every route is the caller's own. The userId comes from the session and never
// from a path or body, so there is no request that reaches another account's
// addresses.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as addressService from '../services/address.service';

const addressSchema = z.object({
  label: z.string().min(1, 'Give this address a name, like Home or Office').max(40),
  line: z.string().min(1, 'Enter the address').max(500),
  city: z.string().min(1, 'Pick the city this address is in'),
  phone: z.string().max(20).optional().nullable(),
  landmark: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

function bad(res: Response, error: z.ZodError) {
  return res.status(400).json({ message: error.issues[0]?.message || 'Invalid input' });
}

/** Express types :id as string | string[]; a single-segment route only ever gives a string. */
const addressId = (req: Request) => req.params.id as string;

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ addresses: await addressService.listAddresses(req.user!.userId) });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error);
    res.status(201).json(await addressService.createAddress(req.user!.userId, parsed.data));
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error);
    res.json(await addressService.updateAddress(req.user!.userId, addressId(req), parsed.data));
  } catch (error) {
    next(error);
  }
}

// PATCH /api/addresses/:id/default — make this the one checkout starts on
export async function setDefault(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await addressService.setDefaultAddress(req.user!.userId, addressId(req)));
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await addressService.deleteAddress(req.user!.userId, addressId(req));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
