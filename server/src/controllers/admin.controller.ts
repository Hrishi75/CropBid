// =============================================================================
// Admin Controller — HTTP Layer for Admin Operations
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as adminService from '../services/admin.service';
import * as agriInputService from '../services/agriInput.service';
import * as equipmentService from '../services/equipment.service';
import { INDIAN_STATES } from '../utils/indianStates';
import { prisma } from '../lib/prisma';
import { auditFromRequest } from '../services/audit.service';

const updateUserSchema = z.object({
  trustScore: z.number().min(0).max(100).optional(),
  suspended: z.boolean().optional(),
});

const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user id'),
});

const purgeDemoDataSchema = z.object({
  confirm: z.literal('PURGE_DEMO_DATA'),
  extraEmails: z.array(z.string().email()).max(50).optional(),
});

const enquiryIdParamSchema = z.object({
  id: z.string().uuid('Invalid enquiry id'),
});

// Which catalogue a lead belongs to. Defaults to EQUIPMENT because that is
// the only kind this endpoint served before inputs had an admin view, so an
// older admin page still in someone's browser keeps working.
const enquiryKindSchema = z.enum(['EQUIPMENT', 'AGRI_INPUT']).default('EQUIPMENT');

const updateEnquirySchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'CLOSED']),
  kind: enquiryKindSchema,
});

// GET /api/admin/stats — Platform-wide statistics
export async function getPlatformStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await adminService.getPlatformStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/users — List users with search & filter
export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, role, limit, offset } = req.query;
    const result = await adminService.getUsers(
      search as string,
      role as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/listings — List all listings
export async function getAllListings(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, limit, offset } = req.query;
    const result = await adminService.getAllListings(
      status as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/attention — The ops triage queue
export async function getAttentionItems(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await adminService.getAttentionItems();
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/transactions — List all transactions
export async function getAllTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { paymentStatus, limit, offset } = req.query;
    const result = await adminService.getAllTransactions(
      paymentStatus as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/users/:id — Update user (trust score, verification)
export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const body = updateUserSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: body.error.issues[0]?.message || 'Invalid input' });
    }

    // Capture the prior trustScore so the audit row carries a real diff.
    // Single column read, no extra round-trip cost beyond one query.
    const before = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { trustScore: true, suspended: true },
    });

    const user = await adminService.updateUser(params.data.id, body.data);

    await auditFromRequest(req, {
      action: 'admin.user.update',
      entityType: 'User',
      entityId: params.data.id,
      metadata: {
        before: { trustScore: before?.trustScore ?? null, suspended: before?.suspended ?? null },
        after: { trustScore: user.trustScore, suspended: user.suspended },
        requested: body.data,
      },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/admin/users/:id — Hard-delete a user that never transacted
export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const result = await adminService.deleteUser(params.data.id, req.user!.userId);

    await auditFromRequest(req, {
      action: 'admin.user.delete',
      entityType: 'User',
      entityId: params.data.id,
      metadata: { email: result.email },
    });

    res.json({ message: 'User deleted', ...result });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/admin/listings/:id — Remove a listing (no transactions attached)
export async function deleteListing(req: Request, res: Response, next: NextFunction) {
  try {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const result = await adminService.deleteListing(params.data.id);

    await auditFromRequest(req, {
      action: 'admin.listing.delete',
      entityType: 'Listing',
      entityId: params.data.id,
      metadata: { cropName: result.cropName },
    });

    res.json({ message: 'Listing deleted', ...result });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/demo-data — what a purge would remove, and what would stop
// it. Read-only, so the panel can show the set before anybody confirms it.
export async function getDemoData(req: Request, res: Response, next: NextFunction) {
  try {
    const emails = typeof req.query.extraEmails === 'string' && req.query.extraEmails.length > 0
      ? req.query.extraEmails.split(',').map((e) => e.trim()).filter(Boolean).slice(0, 50)
      : [];
    res.json(await adminService.previewDemoData(req.user!.userId, emails));
  } catch (error) {
    next(error);
  }
}

// POST /api/admin/purge-demo-data — removes the demo accounts and the rows
// that belong to them. Requires the exact confirm phrase in the body so it can
// never be triggered by a stray click or replayed request drafted for another
// endpoint.
export async function purgeDemoData(req: Request, res: Response, next: NextFunction) {
  try {
    const body = purgeDemoDataSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: 'Confirmation phrase missing — send { "confirm": "PURGE_DEMO_DATA" }' });
    }

    const result = await adminService.purgeDemoData(req.user!.userId, body.data.extraEmails ?? []);

    await auditFromRequest(req, {
      action: 'admin.purge_demo_data',
      entityType: 'Platform',
      entityId: 'demo-data',
      metadata: result.deleted,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/enquiries — Inbound equipment leads
export async function getEnquiries(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, limit, offset } = req.query;
    const kind = enquiryKindSchema.safeParse(req.query.kind);
    if (!kind.success) {
      return res.status(400).json({ message: 'kind must be EQUIPMENT or AGRI_INPUT' });
    }
    const list = kind.data === 'AGRI_INPUT'
      ? adminService.getAgriInputEnquiries
      : adminService.getEquipmentEnquiries;
    const result = await list(
      status as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/enquiries/:id — Move a lead through the triage queue
export async function updateEnquiryStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const params = enquiryIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const body = updateEnquirySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: 'Status must be NEW, CONTACTED, or CLOSED' });
    }

    const result = await adminService.updateEnquiryStatus(params.data.id, body.data.status, body.data.kind);

    await auditFromRequest(req, {
      action: 'admin.enquiry.update_status',
      entityType: body.data.kind === 'AGRI_INPUT' ? 'AgriInputEnquiry' : 'EquipmentEnquiry',
      entityId: params.data.id,
      metadata: { status: body.data.status },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// SEEDS & FERTILISER — the /inputs catalogue as ops see it
// =============================================================================
// What is loaded, what a farmer can see of it, and what the rest is waiting on;
// plus adding shops and products, and entering a shop's licences. The rules a
// product must satisfy, and the one about who may vouch for a licence, live in
// agriInput.service so they bind every caller, not just this one.

const agriInputListQuerySchema = z.object({
  category: z.enum(agriInputService.CATEGORIES).optional(),
  visibility: z.enum(['live', 'hidden']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/admin/agri-inputs — every product, gated or not, and why
export async function getAgriInputCatalogue(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = agriInputListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Invalid query' });
      return;
    }
    res.json(await agriInputService.listCatalogueForAdmin(parsed.data));
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/agri-inputs/suppliers — the shops, and which licences are on file.
// Carries the list of states too, so the add-shop picker offers exactly what
// the server will accept instead of keeping its own copy.
export async function getAgriInputSuppliers(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ...(await agriInputService.listSuppliersForAdmin()), states: INDIAN_STATES });
  } catch (error) {
    next(error);
  }
}

function invalid(res: Response, error: z.ZodError) {
  res.status(400).json({ error: true, message: error.issues[0]?.message || 'Invalid input' });
}

const text = (max: number) => z.string().trim().max(max);

// On an edit, absent means "leave it" and '' or null means "clear it".
const clearable = (max: number) =>
  text(max).nullable().optional().transform((v) => (v === '' ? null : v));

const productShape = {
  title: text(120).min(2, 'Give the product a name'),
  category: z.enum(agriInputService.CATEGORIES),
  brand: clearable(80),
  cropNames: z.array(text(40)).max(20),
  packSize: text(40).min(1, 'Say what one pack is, e.g. "45 kg bag"'),
  pricePerPack: z.number().positive('The price must be more than zero').max(1_000_000),
  subsidised: z.boolean(),
  composition: clearable(120),
  germinationPct: z.number().min(0).max(100).nullable().optional(),
  seedTreatment: clearable(80),
  dosagePerAcre: clearable(80),
  specs: z.array(text(60).min(1)).max(10),
  description: clearable(1000),
};

export const createProductSchema = z.object({
  supplierId: z.string().uuid('Pick a shop'),
  ...productShape,
  subsidised: productShape.subsidised.default(false),
  cropNames: productShape.cropNames.default([]),
  specs: productShape.specs.default([]),
});

export const updateProductSchema = z.object(productShape).partial().extend({
  active: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid('Invalid id') });

// POST /api/admin/agri-inputs — add a product to a shop
export async function createAgriInput(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);

    const { supplierId, ...f } = parsed.data;
    const product = await agriInputService.createAgriInput(supplierId, {
      ...f,
      brand: f.brand ?? null,
      composition: f.composition ?? null,
      germinationPct: f.germinationPct ?? null,
      seedTreatment: f.seedTreatment ?? null,
      dosagePerAcre: f.dosagePerAcre ?? null,
      description: f.description ?? null,
    });

    await auditFromRequest(req, {
      action: 'admin.agri_input.create',
      entityType: 'AgriInput',
      entityId: product.id,
      metadata: { supplierId, title: product.title, category: product.category, pricePerPack: product.pricePerPack },
    });

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/agri-inputs/:id — edit a product, or take it off / put it back
export async function updateAgriInput(req: Request, res: Response, next: NextFunction) {
  try {
    const param = idParamSchema.safeParse(req.params);
    if (!param.success) return invalid(res, param.error);
    const body = updateProductSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (Object.keys(body.data).length === 0) {
      res.status(400).json({ error: true, message: 'Nothing to change' });
      return;
    }

    const product = await agriInputService.updateAgriInput(param.data.id, body.data);

    await auditFromRequest(req, {
      action: 'admin.agri_input.update',
      entityType: 'AgriInput',
      entityId: product.id,
      metadata: { changes: body.data },
    });

    res.json(product);
  } catch (error) {
    next(error);
  }
}

const phone = text(20).regex(/^\+?\d[\d\s-]{8,16}\d$/, 'Enter a phone number farmers can call');

const emailField = text(120)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'That email address does not look right')
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v));

export const createSupplierSchema = z.object({
  name: text(120).min(2, 'Give the shop a name'),
  location: text(80).min(2, 'Which town is the shop in?'),
  state: text(60).min(2, 'Which state is the shop in?'),
  contactPhone: phone,
  contactEmail: emailField,
});

const updateSupplierSchema = z.object({
  name: text(120).min(2, 'Give the shop a name').optional(),
  contactPhone: phone.optional(),
  contactEmail: emailField,
  active: z.boolean().optional(),
});

// POST /api/admin/agri-inputs/suppliers — add a shop (unlicensed until licences are entered)
export async function createAgriInputSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);

    const shop = await agriInputService.createSupplier({
      ...parsed.data,
      contactEmail: parsed.data.contactEmail ?? null,
    });

    // The phone number stays out of the log, as it stays out of every read.
    await auditFromRequest(req, {
      action: 'admin.input_supplier.create',
      entityType: 'InputSupplier',
      entityId: shop.id,
      metadata: { name: shop.name, state: shop.state },
    });

    res.status(201).json(shop);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/agri-inputs/suppliers/:id — rename, new phone, take off / put back
export async function updateAgriInputSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const param = idParamSchema.safeParse(req.params);
    if (!param.success) return invalid(res, param.error);

    // Said out loud rather than silently dropped by the schema: an admin who
    // sent a new state would otherwise think the shop had moved.
    if (req.body && ('location' in req.body || 'state' in req.body)) {
      res.status(400).json({
        error: true,
        message: "A shop's town and state cannot change: a licence covers one premises in one state. Add it as a new shop.",
      });
      return;
    }

    const body = updateSupplierSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (Object.keys(body.data).length === 0) {
      res.status(400).json({ error: true, message: 'Nothing to change' });
      return;
    }

    const shop = await agriInputService.updateSupplier(param.data.id, body.data);

    await auditFromRequest(req, {
      action: 'admin.input_supplier.update',
      entityType: 'InputSupplier',
      entityId: shop.id,
      metadata: { changed: Object.keys(body.data), ...(body.data.active !== undefined && { active: body.data.active }) },
    });

    res.json(shop);
  } catch (error) {
    next(error);
  }
}

// Licence numbers as printed on the certificate: MH/PUN/SEED/2019/4471 and the
// like. Loose on purpose, because every state formats them differently; the
// check that matters is the admin having seen the document.
const licenceNumber = text(60)
  .min(4, 'That is too short to be a licence number')
  .regex(/^[A-Za-z0-9][A-Za-z0-9 /.-]*$/, 'Type the number as printed: letters, digits, / - and .');

export const licenceSchema = z.object({
  seed: licenceNumber.nullable().optional(),
  fertiliser: licenceNumber.nullable().optional(),
  pesticide: licenceNumber.nullable().optional(),
  paperworkSeen: z.boolean().default(false),
});

// PUT /api/admin/agri-inputs/suppliers/:id/licences — enter or clear licences.
// Audited inside the service, in the same transaction as the write.
export async function setAgriInputSupplierLicences(req: Request, res: Response, next: NextFunction) {
  try {
    const param = idParamSchema.safeParse(req.params);
    if (!param.success) return invalid(res, param.error);
    const body = licenceSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);

    const { paperworkSeen, ...licences } = body.data;
    const shop = await agriInputService.setSupplierLicences(
      req.user!.userId,
      param.data.id,
      licences,
      paperworkSeen
    );
    res.json(shop);
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// PARTNER APPLICATIONS — approval queue endpoints
// =============================================================================

const partnerListQuerySchema = z.object({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
  kind: z.enum(['SELLER', 'BUYER']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/admin/partners — the queue, oldest submission first
export async function getPartnerApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = partnerListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Invalid query' });
      return;
    }
    const { status, kind, limit, offset } = parsed.data;
    const [result, counts] = await Promise.all([
      adminService.listPartnerApplications(status, kind, limit, offset),
      adminService.getPartnerCounts(),
    ]);
    res.json({ ...result, counts });
  } catch (error) {
    next(error);
  }
}

const partnerReviewSchema = z.object({
  kind: z.enum(['SELLER', 'BUYER']),
  action: z.enum(['APPROVE', 'REQUEST_INFO', 'REJECT', 'SUSPEND', 'REINSTATE']),
  note: z.string().trim().max(1000).optional(),
});

const partnerIdParamSchema = z.object({
  id: z.string().uuid('Invalid application id'),
});

// GET /api/admin/partners/:id/payout — the seller's account, in full
//
// Separate from the application list on purpose: the list says whether a
// seller can be paid, this says how, and only this one writes an audit row
// (admin.service.getSellerPayoutDetails).
export async function getSellerPayoutDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const param = partnerIdParamSchema.safeParse(req.params);
    if (!param.success) {
      res.status(400).json({ error: true, message: 'Invalid application id' });
      return;
    }
    const payout = await adminService.getSellerPayoutDetails(req.user!.userId, param.data.id);
    res.json({ payout });
  } catch (error) {
    next(error);
  }
}

// POST /api/admin/partners/:id/review — one endpoint, every decision.
// The service enforces which transitions are legal from which status.
export async function reviewPartnerApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const param = partnerIdParamSchema.safeParse(req.params);
    const body = partnerReviewSchema.safeParse(req.body);
    if (!param.success || !body.success) {
      res.status(400).json({ error: true, message: param.success ? (body as any).error.issues[0]?.message || 'Invalid input' : 'Invalid application id' });
      return;
    }
    const profile = await adminService.reviewPartnerApplication({
      kind: body.data.kind,
      profileId: param.data.id,
      action: body.data.action,
      note: body.data.note,
      adminId: req.user!.userId,
    });
    res.json({ profile });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// MACHINERY — the /equipment catalogue, as ops see it and write to it
// =============================================================================
// Same shape as the seeds and fertiliser endpoints above. What is missing is
// the licence gate, which machinery has no equivalent of, so there is no
// "hidden and waiting on paperwork" state here: a row is live unless somebody
// took it, or its dealer, off the catalogue.
//
// The dealer's phone number is written by these and never read back by them,
// exactly as on the inputs side.

const equipmentListQuerySchema = z.object({
  category: z.enum(equipmentService.CATEGORIES).optional(),
  visibility: z.enum(['live', 'hidden']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/admin/equipment — every machine, live or not, and why not
export async function getEquipmentCatalogue(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = equipmentListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Invalid query' });
      return;
    }
    res.json(await equipmentService.listCatalogueForAdmin(parsed.data));
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/equipment/dealers — the dealers, with the states the server
// will accept, so the add-dealer picker keeps no copy of that list.
export async function getEquipmentDealers(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ ...(await equipmentService.listDealersForAdmin()), states: INDIAN_STATES });
  } catch (error) {
    next(error);
  }
}

// Bounded, not judged: whether a price is required, forbidden or positive is
// decided by the machine's mode, and that rule lives in the service so every
// caller is held to it.
const rupees = z.number().max(100_000_000).nullable().optional();

const machineShape = {
  title: text(120).min(2, 'Give the machine a name'),
  category: z.enum(equipmentService.CATEGORIES),
  brand: clearable(80),
  modelName: clearable(80),
  condition: z.enum(['NEW', 'USED']),
  yearMade: z.number().int().nullable().optional(),
  mode: z.enum(equipmentService.MODES),
  salePrice: rupees,
  rentPricePerDay: rupees,
  rentPricePerHour: rupees,
  securityDeposit: rupees,
  powerHp: z.number().max(10_000).nullable().optional(),
  specs: z.array(text(60).min(1)).max(10),
  description: clearable(1000),
};

export const createMachineSchema = z.object({
  dealerId: z.string().uuid('Pick a dealer'),
  ...machineShape,
  condition: machineShape.condition.default('NEW'),
  mode: machineShape.mode.default('SALE'),
  specs: machineShape.specs.default([]),
});

export const updateMachineSchema = z.object(machineShape).partial().extend({
  active: z.boolean().optional(),
});

// The service takes explicit nulls, so an absent optional is not mistaken for
// "leave it" on a create, where there is nothing to leave.
const machineFields = (f: z.infer<typeof createMachineSchema>) => ({
  title: f.title,
  category: f.category,
  brand: f.brand ?? null,
  modelName: f.modelName ?? null,
  condition: f.condition,
  yearMade: f.yearMade ?? null,
  mode: f.mode,
  salePrice: f.salePrice ?? null,
  rentPricePerDay: f.rentPricePerDay ?? null,
  rentPricePerHour: f.rentPricePerHour ?? null,
  securityDeposit: f.securityDeposit ?? null,
  powerHp: f.powerHp ?? null,
  specs: f.specs,
  description: f.description ?? null,
});

// POST /api/admin/equipment — add a machine to a dealer
export async function createEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createMachineSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);

    const { dealerId } = parsed.data;
    const machine = await equipmentService.createEquipment(dealerId, machineFields(parsed.data));

    await auditFromRequest(req, {
      action: 'admin.equipment.create',
      entityType: 'Equipment',
      entityId: machine.id,
      metadata: { dealerId, title: machine.title, category: machine.category, mode: machine.mode },
    });

    res.status(201).json(machine);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/equipment/:id — edit a machine, take it off, put it back
export async function updateEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const param = idParamSchema.safeParse(req.params);
    if (!param.success) return invalid(res, param.error);
    const body = updateMachineSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (Object.keys(body.data).length === 0) {
      res.status(400).json({ error: true, message: 'Nothing to change' });
      return;
    }

    const machine = await equipmentService.updateEquipment(param.data.id, body.data);

    await auditFromRequest(req, {
      action: 'admin.equipment.update',
      entityType: 'Equipment',
      entityId: machine.id,
      metadata: { changed: Object.keys(body.data), ...(body.data.active !== undefined && { active: body.data.active }) },
    });

    res.json(machine);
  } catch (error) {
    next(error);
  }
}

export const createDealerSchema = z.object({
  name: text(120).min(2, 'Give the dealer a name'),
  location: text(80).min(2, 'Which town is the dealer in?'),
  state: text(60).min(2, 'Which state is the dealer in?'),
  contactPhone: phone,
  contactEmail: emailField,
});

// Town and state are editable here, unlike a licensed input shop: nothing about
// a machinery dealer is tied to one premises. The service carries their
// machines to the new town in the same transaction.
const updateDealerSchema = z.object({
  name: text(120).min(2, 'Give the dealer a name').optional(),
  location: text(80).min(2, 'Which town is the dealer in?').optional(),
  state: text(60).min(2, 'Which state is the dealer in?').optional(),
  contactPhone: phone.optional(),
  contactEmail: emailField,
  active: z.boolean().optional(),
});

// POST /api/admin/equipment/dealers — add a dealer (no claims until checked)
export async function createEquipmentDealer(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createDealerSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);

    const dealer = await equipmentService.createDealer({
      ...parsed.data,
      contactEmail: parsed.data.contactEmail ?? null,
    });

    // The phone number stays out of the log, as it stays out of every read.
    await auditFromRequest(req, {
      action: 'admin.equipment_dealer.create',
      entityType: 'EquipmentDealer',
      entityId: dealer.id,
      metadata: { name: dealer.name, state: dealer.state },
    });

    res.status(201).json(dealer);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/equipment/dealers/:id — rename, move, phone, take off
export async function updateEquipmentDealer(req: Request, res: Response, next: NextFunction) {
  try {
    const param = idParamSchema.safeParse(req.params);
    if (!param.success) return invalid(res, param.error);
    const body = updateDealerSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    if (Object.keys(body.data).length === 0) {
      res.status(400).json({ error: true, message: 'Nothing to change' });
      return;
    }

    const dealer = await equipmentService.updateDealer(param.data.id, body.data);

    await auditFromRequest(req, {
      action: 'admin.equipment_dealer.update',
      entityType: 'EquipmentDealer',
      entityId: dealer.id,
      metadata: { changed: Object.keys(body.data), ...(body.data.active !== undefined && { active: body.data.active }) },
    });

    res.json(dealer);
  } catch (error) {
    next(error);
  }
}

export const dealerClaimsSchema = z.object({
  verified: z.boolean().optional(),
  smamEmpanelled: z.boolean().optional(),
  checked: z.boolean().default(false),
});

// PUT /api/admin/equipment/dealers/:id/claims — the verified badge and the
// SMAM listing. Audited inside the service, in the same transaction.
export async function setEquipmentDealerClaims(req: Request, res: Response, next: NextFunction) {
  try {
    const param = idParamSchema.safeParse(req.params);
    if (!param.success) return invalid(res, param.error);
    const body = dealerClaimsSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);

    const { checked, ...patch } = body.data;
    const dealer = await equipmentService.setDealerClaims(req.user!.userId, param.data.id, patch, checked);

    res.json(dealer);
  } catch (error) {
    next(error);
  }
}
