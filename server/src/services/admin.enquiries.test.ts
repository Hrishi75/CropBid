// =============================================================================
// Admins can see, and work, the leads /inputs produces
// =============================================================================
// Seed, fertiliser and crop-protection enquiries were visible to nobody but
// the farmer who raised them: the only read path was getMyEnquiries, scoped
// to that farmer. A lead the marketplace produced could not be followed up or
// even counted.
//
// Against a real Postgres, because the thing worth pinning is which rows come
// back and which table a status change lands in. What has to hold:
//
//   1. Input leads are listed, with the supplier's number to call and no
//      licence number, which never leaves the server (CLAUDE.md section 10).
//   2. A lead is listed even when its shop is no longer licensed: SELLABLE
//      governs what a farmer can enquire about, not what an admin can read.
//   3. A status change goes to the catalogue it is told, and an id from one
//      catalogue cannot move a row in the other.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { getAgriInputEnquiries, getEquipmentEnquiries, updateEnquiryStatus } from './admin.service';

const FARMER = 'adm-enq-farmer';
const SUPPLIER = 'adm-enq-supplier';
const PRODUCT = 'adm-enq-product';
const DEALER = 'adm-enq-dealer';
const MACHINE = 'adm-enq-machine';

async function reset() {
  await prisma.agriInputEnquiry.deleteMany({ where: { userId: FARMER } });
  await prisma.equipmentEnquiry.deleteMany({ where: { userId: FARMER } });
  await prisma.agriInput.deleteMany({ where: { id: PRODUCT } });
  await prisma.inputSupplier.deleteMany({ where: { id: SUPPLIER } });
  await prisma.equipment.deleteMany({ where: { id: MACHINE } });
  await prisma.equipmentDealer.deleteMany({ where: { id: DEALER } });
  await prisma.user.deleteMany({ where: { id: FARMER } });
}

beforeEach(async () => {
  await reset();
  await prisma.user.create({
    data: { id: FARMER, name: 'Sunita Kale', email: `${FARMER}@test.local`, password: 'x', role: 'FARMER', phone: '9822000001' },
  });
  await prisma.inputSupplier.create({
    data: {
      id: SUPPLIER, name: 'Admin Leads Test Shop', location: 'Nagpur', state: 'Maharashtra',
      contactPhone: '9811111111', seedLicence: 'MH/SEED/2024/0001',
    },
  });
  await prisma.agriInput.create({
    data: {
      id: PRODUCT, supplierId: SUPPLIER, title: 'Bt Cotton hybrid', category: 'SEED',
      cropNames: ['Cotton'], packSize: '475 g', pricePerPack: 864, location: 'Nagpur', state: 'Maharashtra',
    },
  });
  await prisma.equipmentDealer.create({
    data: { id: DEALER, name: 'Admin Leads Test Dealer', location: 'Pune', state: 'Maharashtra', contactPhone: '9800000000' },
  });
  await prisma.equipment.create({
    data: {
      id: MACHINE, dealerId: DEALER, title: 'Mahindra 575 DI', category: 'TRACTOR',
      mode: 'BOTH', location: 'Pune', state: 'Maharashtra',
    },
  });
});

afterAll(reset);

// Every read asks for a wide page. The lists are newest first and default to
// twenty rows, so rows another test file writes at the same moment could
// otherwise push the lead under test off the page and fail this for a reason
// that has nothing to do with the code.
const WIDE = 500;

const inputLead = () =>
  prisma.agriInputEnquiry.create({ data: { agriInputId: PRODUCT, userId: FARMER, acres: 4 } });
const machineLead = () =>
  prisma.equipmentEnquiry.create({ data: { equipmentId: MACHINE, userId: FARMER, intent: 'SALE' } });

describe('the input lead list', () => {
  it('lists a lead with who asked, for what, and the shop to call', async () => {
    const lead = await inputLead();

    const { enquiries, total } = await getAgriInputEnquiries(undefined, WIDE);
    const row = enquiries.find((e) => e.id === lead.id)!;

    expect(total).toBeGreaterThanOrEqual(1);
    expect(row.user.name).toBe('Sunita Kale');
    expect(row.agriInput.title).toBe('Bt Cotton hybrid');
    expect(row.agriInput.supplier.contactPhone).toBe('9811111111');
    expect(row.acres).toBe(4);
  });

  it('never carries a licence number', async () => {
    await inputLead();

    const { enquiries } = await getAgriInputEnquiries(undefined, WIDE);

    expect(JSON.stringify(enquiries)).not.toContain('MH/SEED/2024/0001');
  });

  // Licences lapse. The lead does not stop being a lead, and a lapsed shop
  // with farmers waiting on it is exactly when somebody should be calling.
  it('still lists a lead after the shop loses its licence', async () => {
    const lead = await inputLead();
    await prisma.inputSupplier.update({ where: { id: SUPPLIER }, data: { seedLicence: null } });

    const { enquiries } = await getAgriInputEnquiries(undefined, WIDE);

    expect(enquiries.some((e) => e.id === lead.id)).toBe(true);
  });

  it('filters by status', async () => {
    const lead = await inputLead();
    await updateEnquiryStatus(lead.id, 'CONTACTED', 'AGRI_INPUT');

    const contacted = await getAgriInputEnquiries('CONTACTED', WIDE);
    const fresh = await getAgriInputEnquiries('NEW', WIDE);

    expect(contacted.enquiries.some((e) => e.id === lead.id)).toBe(true);
    expect(fresh.enquiries.some((e) => e.id === lead.id)).toBe(false);
  });
});

describe('working a lead', () => {
  it('moves an input lead when told it is one', async () => {
    const lead = await inputLead();

    await updateEnquiryStatus(lead.id, 'CLOSED', 'AGRI_INPUT');

    const after = await prisma.agriInputEnquiry.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe('CLOSED');
  });

  // The default is equipment, so an admin page from before this change keeps
  // working without sending a kind.
  it('treats a lead with no kind as equipment, as it always did', async () => {
    const lead = await machineLead();

    await updateEnquiryStatus(lead.id, 'CONTACTED');

    const after = await prisma.equipmentEnquiry.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe('CONTACTED');
  });

  // The two tables have separate id spaces. Sent to the wrong one, an id
  // finds nothing: it must not be allowed to land anywhere.
  it('will not move a row in the other catalogue', async () => {
    const input = await inputLead();
    const machine = await machineLead();

    await expect(updateEnquiryStatus(input.id, 'CLOSED', 'EQUIPMENT')).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateEnquiryStatus(machine.id, 'CLOSED', 'AGRI_INPUT')).rejects.toMatchObject({ statusCode: 404 });

    expect((await prisma.agriInputEnquiry.findUniqueOrThrow({ where: { id: input.id } })).status).toBe('NEW');
    expect((await prisma.equipmentEnquiry.findUniqueOrThrow({ where: { id: machine.id } })).status).toBe('NEW');
  });

  it('keeps the equipment list to equipment', async () => {
    const input = await inputLead();
    const machine = await machineLead();

    const { enquiries } = await getEquipmentEnquiries(undefined, WIDE);

    expect(enquiries.some((e) => e.id === machine.id)).toBe(true);
    expect(enquiries.some((e) => e.id === input.id)).toBe(false);
  });
});
