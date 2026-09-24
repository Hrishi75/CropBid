// =============================================================================
// Adding to the machinery catalogue from the admin panel
// =============================================================================
// /equipment reached the database through prisma/seedEquipment.ts alone, so a
// new dealer meant a file edit and a deploy. What has to hold now that ops can
// write it:
//
//   1. A machine is held to the pricing rules /equipment already assumes,
//      whether it is new or edited: a machine offered for sale has a sale
//      price, one offered for hire has a rate, and a sale-only machine carries
//      neither a rate nor a deposit. A machine priced for something it is not
//      offered for is a row the farmer searching for it can never find.
//   2. A machine is where its dealer is, and a dealer who moves takes their
//      machines with them, because /equipment files a machine under its own
//      state.
//   3. Taking a dealer off takes their machines off /equipment with them, and
//      the admin view says which of the two is the reason.
//   4. The verified badge and the SMAM listing need the admin to say they have
//      checked, and leave an audit row naming who, in the same transaction.
//      Taking one down needs no such say-so.
//   5. The badge comes down when what it vouched for changes: the tick says
//      this business exists at this address on this number, so editing any of
//      those leaves a claim nobody checked.
//   6. No read gives back a dealer's phone number, which leaves the server from
//      createEnquiry alone.
//
// Against a real Postgres, because the claims are about what the catalogue
// returns after a write has committed.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  browseEquipment,
  createDealer,
  createEquipment,
  listCatalogueForAdmin,
  listDealersForAdmin,
  setDealerClaims,
  updateDealer,
  updateEquipment,
  type EquipmentFields,
} from './equipment.service';

const ADMIN = 'eq-admin-1';
const DEALER = 'Adminwrite Test Yantra';
const OTHER = 'Adminwrite Other Yantra';

// By prefix, not by the two names: a test renames a dealer, and cleaning up
// only the names it started with leaves that row behind to collide with the
// next run.
async function reset() {
  const dealers = await prisma.equipmentDealer.findMany({
    where: { name: { startsWith: 'Adminwrite' } },
    select: { id: true },
  });
  const ids = dealers.map((d) => d.id);
  await prisma.equipmentEnquiry.deleteMany({ where: { equipment: { dealerId: { in: ids } } } });
  await prisma.equipment.deleteMany({ where: { dealerId: { in: ids } } });
  await prisma.equipmentDealer.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: ADMIN } });
  await prisma.user.deleteMany({ where: { id: ADMIN } });
}

// A tractor for sale, the shape the rules are measured against.
const tractor = (over: Partial<EquipmentFields> = {}): EquipmentFields => ({
  title: 'Adminwrite 575 DI',
  category: 'TRACTOR',
  brand: 'Mahindra',
  modelName: '575 DI',
  condition: 'NEW',
  yearMade: null,
  mode: 'SALE',
  salePrice: 785000,
  rentPricePerDay: null,
  rentPricePerHour: null,
  securityDeposit: null,
  powerHp: 45,
  specs: ['540 PTO RPM'],
  description: null,
  ...over,
});

let dealerId = '';

beforeEach(async () => {
  await reset();
  await prisma.user.create({
    data: { id: ADMIN, name: 'Ops', email: `${ADMIN}@test.local`, password: 'x', role: 'ADMIN' },
  });
  const dealer = await createDealer({
    name: DEALER,
    location: 'Nashik',
    state: 'maharashtra',
    contactPhone: '+91-9820000901',
    contactEmail: null,
  });
  dealerId = dealer.id;
});

afterAll(reset);

const mine = async () => {
  const { equipment } = await listCatalogueForAdmin({ q: 'Adminwrite', limit: 50, offset: 0 });
  return equipment;
};

describe('adding a dealer', () => {
  it('stores the state in the list spelling, whatever case it was typed in', async () => {
    const { dealers } = await listDealersForAdmin({ id: dealerId });
    expect(dealers[0].state).toBe('Maharashtra');
  });

  it('starts unverified and not empanelled, whatever the request says', async () => {
    const { dealers } = await listDealersForAdmin({ id: dealerId });
    expect(dealers[0].verified).toBe(false);
    expect(dealers[0].smamEmpanelled).toBe(false);
  });

  it('refuses a state that is not on the list', async () => {
    await expect(createDealer({
      name: OTHER, location: 'Nashik', state: 'Maharastra',
      contactPhone: '+91-9820000902', contactEmail: null,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a second dealer of the same name in the same state', async () => {
    await expect(createDealer({
      name: DEALER, location: 'Pune', state: 'Maharashtra',
      contactPhone: '+91-9820000903', contactEmail: null,
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('the pricing rules', () => {
  it('takes a machine for sale with a sale price', async () => {
    const machine = await createEquipment(dealerId, tractor());
    expect(machine.live).toBe(true);
    expect(machine.salePrice).toBe(785000);
  });

  it('refuses one offered for sale with no sale price', async () => {
    await expect(createEquipment(dealerId, tractor({ salePrice: null })))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses one offered for hire with no rate', async () => {
    await expect(createEquipment(dealerId, tractor({ mode: 'RENT', salePrice: null })))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a sale-only machine that carries a rate or a deposit', async () => {
    await expect(createEquipment(dealerId, tractor({ rentPricePerDay: 2000 })))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(createEquipment(dealerId, tractor({ securityDeposit: 5000 })))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('takes an hourly-only rental, which is how /equipment prices some of them', async () => {
    const machine = await createEquipment(dealerId, tractor({
      mode: 'RENT', salePrice: null, rentPricePerHour: 650, securityDeposit: 5000,
    }));
    expect(machine.rentPricePerHour).toBe(650);
  });

  it('needs both prices for a machine offered either way', async () => {
    await expect(createEquipment(dealerId, tractor({ mode: 'BOTH' })))
      .rejects.toMatchObject({ statusCode: 400 });
    const machine = await createEquipment(dealerId, tractor({ mode: 'BOTH', rentPricePerDay: 2200 }));
    expect(machine.mode).toBe('BOTH');
  });

  it('rounds a price to paise', async () => {
    const machine = await createEquipment(dealerId, tractor({ salePrice: 785000.456 }));
    expect(machine.salePrice).toBe(785000.46);
  });

  it('refuses an implausible year', async () => {
    await expect(createEquipment(dealerId, tractor({ condition: 'USED', yearMade: 1849 })))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  // The rules are checked on the machine as it will be saved, so a patch that
  // changes only the mode is judged on the prices already on the row.
  it('holds an edit to the same rules', async () => {
    const machine = await createEquipment(dealerId, tractor());

    await expect(updateEquipment(machine.id, { mode: 'RENT' }))
      .rejects.toMatchObject({ statusCode: 400 });

    const hired = await updateEquipment(machine.id, {
      mode: 'RENT', salePrice: null, rentPricePerDay: 2200,
    });
    expect(hired.mode).toBe('RENT');
  });

  it('refuses a second machine of the same name at one dealer', async () => {
    await createEquipment(dealerId, tractor());
    await expect(createEquipment(dealerId, tractor())).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('where a machine is', () => {
  it('is where its dealer is, without being asked twice', async () => {
    const machine = await createEquipment(dealerId, tractor());
    expect(machine.location).toBe('Nashik');
    expect(machine.state).toBe('Maharashtra');
  });

  // /equipment filters on the machine's own state, so a dealer whose yard moved
  // must not still answer searches in the town they left.
  it('moves with the dealer', async () => {
    await createEquipment(dealerId, tractor());

    await updateDealer(dealerId, { location: 'Kolhapur', state: 'maharashtra' });

    const [machine] = await mine();
    expect(machine.location).toBe('Kolhapur');
    expect(machine.state).toBe('Maharashtra');
  });
});

describe('taking things off', () => {
  it('takes a machine off /equipment and says why in the panel', async () => {
    const machine = await createEquipment(dealerId, tractor());

    const off = await updateEquipment(machine.id, { active: false });

    expect(off.live).toBe(false);
    expect(off.hiddenBecause).toEqual(['Taken off the catalogue']);
    const { equipment } = await browseEquipment({ q: 'Adminwrite' });
    expect(equipment).toHaveLength(0);
  });

  it('takes the dealer off with their whole catalogue, and names both reasons', async () => {
    const machine = await createEquipment(dealerId, tractor());
    await updateEquipment(machine.id, { active: false });

    await updateDealer(dealerId, { active: false });

    const [row] = await mine();
    expect(row.live).toBe(false);
    expect(row.hiddenBecause).toEqual([
      'Taken off the catalogue',
      'The dealer is taken off the catalogue',
    ]);
  });

  it('puts one back', async () => {
    const machine = await createEquipment(dealerId, tractor());
    await updateEquipment(machine.id, { active: false });

    const back = await updateEquipment(machine.id, { active: true });

    expect(back.live).toBe(true);
    expect(back.hiddenBecause).toEqual([]);
  });
});

describe('the claims about a dealer', () => {
  it('needs the admin to say they have checked', async () => {
    await expect(setDealerClaims(ADMIN, dealerId, { verified: true }, false))
      .rejects.toMatchObject({ statusCode: 400 });

    const { dealers } = await listDealersForAdmin({ id: dealerId });
    expect(dealers[0].verified).toBe(false);
  });

  it('makes the claim, and records who made it, in one transaction', async () => {
    const dealer = await setDealerClaims(ADMIN, dealerId, { verified: true, smamEmpanelled: true }, true);

    expect(dealer.verified).toBe(true);
    expect(dealer.smamEmpanelled).toBe(true);

    const [log] = await prisma.auditLog.findMany({ where: { actorId: ADMIN } });
    expect(log.action).toBe('admin.equipment_dealer.claims');
    expect(log.entityId).toBe(dealerId);
    expect(log.metadata).toMatchObject({ set: ['verified', 'smamEmpanelled'], checked: true });
  });

  // Taking a claim down is always safe.
  it('needs no say-so to take one down', async () => {
    await setDealerClaims(ADMIN, dealerId, { verified: true }, true);

    const dealer = await setDealerClaims(ADMIN, dealerId, { verified: false }, false);

    expect(dealer.verified).toBe(false);
    const logs = await prisma.auditLog.findMany({ where: { actorId: ADMIN }, orderBy: { createdAt: 'asc' } });
    expect(logs.at(-1)!.metadata).toMatchObject({ cleared: ['verified'], checked: false });
  });

  // The tick in ClaimsForm is specific: this business exists at this town, in
  // this state, and this number reaches them. An edit to any of those would
  // otherwise leave the badge standing over details nobody checked.
  describe('when what was checked is edited afterwards', () => {
    beforeEach(async () => {
      await setDealerClaims(ADMIN, dealerId, { verified: true, smamEmpanelled: true }, true);
    });

    it('takes the badge down on a move, and records why', async () => {
      const moved = await updateDealer(dealerId, { location: 'Kolhapur' });

      expect(moved.verified).toBe(false);
      // SMAM is about the scheme, not the address, so it stands.
      expect(moved.smamEmpanelled).toBe(true);

      const logs = await prisma.auditLog.findMany({ where: { actorId: ADMIN } });
      const [dropped] = await prisma.auditLog.findMany({
        where: { entityId: dealerId, actorId: null },
      });
      expect(logs).toHaveLength(1);
      expect(dropped.metadata).toMatchObject({ cleared: ['verified'], because: ['location'] });
    });

    it('takes it down on a rename or a new phone number', async () => {
      const renamed = await updateDealer(dealerId, { name: `${DEALER} II` });
      expect(renamed.verified).toBe(false);

      await setDealerClaims(ADMIN, dealerId, { verified: true }, true);
      const rung = await updateDealer(dealerId, { contactPhone: '+91-9820000999' });
      expect(rung.verified).toBe(false);
    });

    it('leaves it alone when nothing it vouched for changed', async () => {
      const off = await updateDealer(dealerId, { active: false });
      expect(off.verified).toBe(true);

      const same = await updateDealer(dealerId, { location: 'Nashik', contactEmail: 'new@example.test' });
      expect(same.verified).toBe(true);
    });
  });

  it('refuses a request that changes nothing', async () => {
    await expect(setDealerClaims(ADMIN, dealerId, {}, true)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('the dealer phone number', () => {
  // It leaves the server from createEnquiry alone. A panel listing forty
  // dealers must not be a contact list, admin or not.
  it('never comes back from an admin read, not even right after saving it', async () => {
    const created = await createDealer({
      name: OTHER, location: 'Pune', state: 'Maharashtra',
      contactPhone: '+91-9820000904', contactEmail: 'yard@example.test',
    });
    expect(created).not.toHaveProperty('contactPhone');
    expect(created).not.toHaveProperty('contactEmail');

    const { dealers } = await listDealersForAdmin();
    for (const dealer of dealers) {
      expect(dealer).not.toHaveProperty('contactPhone');
      expect(dealer).not.toHaveProperty('contactEmail');
    }

    await createEquipment(created.id, tractor({ title: 'Adminwrite Other 575' }));
    for (const row of await mine()) {
      expect(row.dealer).not.toHaveProperty('contactPhone');
      expect(row.dealer).not.toHaveProperty('contactEmail');
    }
  });
});

describe('the catalogue an admin reads', () => {
  it('counts what is live against what is there, and agrees with /equipment', async () => {
    const machine = await createEquipment(dealerId, tractor());
    await createEquipment(dealerId, tractor({ title: 'Adminwrite Rotavator', category: 'TILLAGE', salePrice: 62000, powerHp: null }));
    await updateEquipment(machine.id, { active: false });

    const live = await listCatalogueForAdmin({ q: 'Adminwrite', visibility: 'live', limit: 50, offset: 0 });
    const hidden = await listCatalogueForAdmin({ q: 'Adminwrite', visibility: 'hidden', limit: 50, offset: 0 });

    expect(live.equipment.map((e) => e.title)).toEqual(['Adminwrite Rotavator']);
    expect(hidden.equipment.map((e) => e.title)).toEqual(['Adminwrite 575 DI']);

    const browsed = await browseEquipment({ q: 'Adminwrite' });
    expect(browsed.equipment.map((e) => e.title)).toEqual(live.equipment.map((e) => e.title));
  });

  it('carries the enquiry count, so a lead is one click from the machine', async () => {
    const machine = await createEquipment(dealerId, tractor());
    await prisma.equipmentEnquiry.create({
      data: { equipmentId: machine.id, userId: ADMIN, intent: 'SALE' },
    });

    const [row] = await mine();
    expect(row.enquiries).toBe(1);
  });
});
