// =============================================================================
// Retail Order Controller: the HTTP layer for a shopper's shop orders
// =============================================================================
// One request per shop in the basket. Validates the body with zod, then hands
// it to retailOrder.service, which prices it, works out the delivery fee and
// claims the stock. See that file for why an order is one shop.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createRetailOrder } from '../services/retailOrder.service';
import { auditFromRequest } from '../services/audit.service';

const lineSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.number().positive('Quantity must be positive'),
  // The unit the client converted its kilograms with, so the server can refuse
  // a line where the two no longer agree.
  unit: z.enum(['KG', 'QUINTAL', 'TONNE']).optional(),
  // Same shape as the direct-purchase key: it lands in a unique index, so it is
  // an opaque, bounded handle, not somewhere to put a sentence.
  idempotencyKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'idempotencyKey must be url-safe').optional(),
});

const createSchema = z.object({
  lines: z.array(lineSchema).min(1, 'An order needs at least one item').max(50),
  // Optional: blank values fall back to the shopper's profile in the service.
  deliveryAddress: z.string().max(500).optional(),
  contactPhone: z.string().max(20).optional(),
  // The delivery fee the shopper was shown. A different answer is refused.
  deliveryFee: z.number().min(0).optional(),
});

// POST /api/retail-orders: place one shop's share of the basket
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const { order, replayed } = await createRetailOrder(req.user!.userId, parsed.data);
    await auditFromRequest(req, {
      action: 'retail_order.create',
      entityType: 'RetailOrder',
      entityId: order.id,
      metadata: {
        lines: parsed.data.lines.length,
        itemsTotal: order.itemsTotal,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        // A replay hands back the order that already existed, so without this
        // the log would read as two orders where the shopper placed one.
        replayed,
      },
    });
    // 201 placed something; 200 means these keys had already placed it. The
    // body is identical either way.
    res.status(replayed ? 200 : 201).json(order);
  } catch (error) {
    next(error);
  }
}
