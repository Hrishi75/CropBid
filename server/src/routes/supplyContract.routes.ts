// =============================================================================
// Supply Contract Routes — one price, a large total, delivered in batches
// =============================================================================
// The buyer proposes and may withdraw; the seller accepts or declines; either
// side may end an active contract. Both read their own list. The owner is
// always taken from the session.
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole, requireApprovedPartner } from '../middleware/roleGuard';
import * as contracts from '../services/supplyContract.service';
import { auditFromRequest } from '../services/audit.service';

const router = Router();
router.use(authenticate);

const proposeSchema = z.object({
  listingId: z.string().min(1),
  totalQuantity: z.coerce.number(),
  batchQuantity: z.coerce.number(),
  everyDays: z.coerce.number().int(),
  pricePerUnit: z.coerce.number(),
  startsAt: z.string().nullable().optional(),
  message: z.string().max(500).nullable().optional(),
});

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

router.get('/rules', requireRole('BUYER', 'FARMER'), (_req, res) => { res.json(contracts.CONTRACT_RULES); });

router.get('/mine', requireRole('BUYER', 'FARMER'), requireApprovedPartner, wrap(async (req, res) => {
  res.json({ contracts: await contracts.getMyContracts(req.user!.userId) });
}));

router.post('/', requireRole('BUYER'), requireApprovedPartner, wrap(async (req, res) => {
  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
  const c = await contracts.proposeContract(req.user!.userId, parsed.data);
  await auditFromRequest(req, { action: 'supply_contract.propose', entityType: 'SupplyContract', entityId: c.id, metadata: { listingId: parsed.data.listingId } });
  res.status(201).json(c);
}));

router.put('/:id/respond', requireRole('FARMER'), requireApprovedPartner, wrap(async (req, res) => {
  const accept = req.body?.accept === true;
  const c = await contracts.respondToContract(String(req.params.id), req.user!.userId, accept);
  await auditFromRequest(req, { action: accept ? 'supply_contract.accept' : 'supply_contract.decline', entityType: 'SupplyContract', entityId: c.id });
  res.json(c);
}));

router.put('/:id/cancel', requireRole('BUYER', 'FARMER'), requireApprovedPartner, wrap(async (req, res) => {
  const c = await contracts.cancelContract(String(req.params.id), req.user!.userId);
  await auditFromRequest(req, { action: 'supply_contract.cancel', entityType: 'SupplyContract', entityId: c.id });
  res.json(c);
}));

export default router;
