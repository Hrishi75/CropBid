// =============================================================================
// Supply contracts, against a real Postgres
// =============================================================================
// What has to hold:
//   - only an FMCG buyer proposes; a price under the lot's floor is refused
//   - accepting a contract that starts now makes its first batch a real deal
//     at the contract price, without touching the source lot's stock
//   - batches follow the schedule, the last one is the remainder, and the
//     contract completes when every batch is made
//   - two processes making batches at once make each batch once
//   - a cancel stops further batches and leaves made ones as deals
// =============================================================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})), pushNotification: vi.fn() }));
vi.mock('./notification.helpers', async (orig) => ({ ...(await orig<object>()), notifyAdminsDealClosed: vi.fn(() => Promise.resolve()) }));
vi.mock('./orderAlert.service', () => ({ alertNewOrder: vi.fn(() => Promise.resolve()) }));

import { prisma } from '../lib/prisma';
import { alertNewOrder } from './orderAlert.service';
import { deleteUser } from './admin.service';
import { cancelContract, createDueBatches, proposeContract, respondToContract } from './supplyContract.service';

const FMCG = 'sc-fmcg';
const PROC = 'sc-proc';
const FARM = 'sc-farm';
const ALL = [FMCG, PROC, FARM];
const DAY = 86_400_000;

let lotId = '';

async function clean() {
  const contracts = await prisma.supplyContract.findMany({ where: { buyerId: { in: ALL } }, select: { id: true } });
  const lots = await prisma.listing.findMany({ where: { farmerId: `${FARM}-profile` }, select: { id: true } });
  const bids = await prisma.bid.findMany({ where: { listingId: { in: lots.map((l) => l.id) } }, select: { id: true } });
  await prisma.transaction.deleteMany({ where: { bidId: { in: bids.map((b) => b.id) } } });
  await prisma.bid.deleteMany({ where: { id: { in: bids.map((b) => b.id) } } });
  await prisma.listing.deleteMany({ where: { id: { in: lots.map((l) => l.id) } } });
  await prisma.supplyContract.deleteMany({ where: { id: { in: contracts.map((c) => c.id) } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ALL } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ALL } } });
  await prisma.user.deleteMany({ where: { id: { in: ALL } } });
}

beforeEach(async () => {
  await clean();
  for (const [id, type, phone] of [[FMCG, 'FMCG', '9800000201'], [PROC, 'PROCESSOR', '9800000203']] as const) {
    await prisma.user.create({
      data: {
        id, name: id, email: `${id}@test.local`, password: 'x', role: 'BUYER', phone, location: 'Delhi',
        buyerProfile: { create: { companyName: id, companyType: type, status: 'APPROVED' } },
      },
    });
  }
  await prisma.user.create({
    data: {
      id: FARM, name: 'Harpreet', email: `${FARM}@test.local`, password: 'x', role: 'FARMER', phone: '9800000202', location: 'Ludhiana',
      farmerProfile: { create: { id: `${FARM}-profile`, state: 'Punjab', status: 'APPROVED' } },
    },
  });
  const lot = await prisma.listing.create({
    data: {
      farmerId: `${FARM}-profile`, cropName: 'SC Test Wheat', quantity: 80, remainingQuantity: 80, unit: 'TONNE',
      qualityGrade: 'A', pricePerUnitMin: 24000, pricePerUnitMax: 26000, location: 'Ludhiana', state: 'Punjab',
    },
  });
  lotId = lot.id;
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

const terms = { totalQuantity: 125, batchQuantity: 50, everyDays: 14, pricePerUnit: 25000 };

describe('proposing', () => {
  it('is for FMCG buyers only', async () => {
    await expect(proposeContract(PROC, { listingId: lotId, ...terms })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a price under the floor and an interval that is not offered', async () => {
    await expect(proposeContract(FMCG, { listingId: lotId, ...terms, pricePerUnit: 20000 })).rejects.toThrow(/floor/);
    await expect(proposeContract(FMCG, { listingId: lotId, ...terms, everyDays: 10 })).rejects.toThrow(/7, 14 or 30/);
  });
});

describe('an accepted contract', () => {
  it('makes its first batch a deal at the contract price, and leaves the lot alone', async () => {
    const c = await proposeContract(FMCG, { listingId: lotId, ...terms });
    expect(c.status).toBe('PROPOSED');
    const active = await respondToContract(c.id, FARM, true);
    expect(active.status).toBe('ACTIVE');
    expect(active.scheduledQuantity).toBe(50);

    const deals = await prisma.transaction.findMany({ where: { buyerId: FMCG } });
    expect(deals).toHaveLength(1);
    expect(deals[0].finalPricePerUnit).toBe(25000);
    expect(deals[0].totalAmount).toBe(1_250_000);
    expect(deals[0].paymentStatus).toBe('AWAITING_PAYMENT');
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: lotId } })).remainingQuantity).toBe(80);
  });

  it('sends ops the same new-order alert as any other deal', async () => {
    // Review caught batches skipping it, so a paid batch reached nobody who
    // books the pickup.
    vi.mocked(alertNewOrder).mockClear();
    const c = await proposeContract(FMCG, { listingId: lotId, ...terms });
    await respondToContract(c.id, FARM, true);
    const deal = await prisma.transaction.findFirstOrThrow({ where: { buyerId: FMCG } });
    expect(alertNewOrder).toHaveBeenCalledTimes(1);
    expect(alertNewOrder).toHaveBeenCalledWith(deal.bidId, 'SUPPLY_CONTRACT_BATCH');
  });

  it('follows the schedule, ends on the remainder, and completes', async () => {
    const c = await proposeContract(FMCG, { listingId: lotId, ...terms });
    await respondToContract(c.id, FARM, true);
    const start = Date.now();

    expect(await createDueBatches(new Date(start + 2 * DAY))).toBe(0); // not due yet
    expect(await createDueBatches(new Date(start + 15 * DAY))).toBe(1);
    expect(await createDueBatches(new Date(start + 29 * DAY))).toBe(1);

    const row = await prisma.supplyContract.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe('COMPLETED');
    expect(row.scheduledQuantity).toBe(125);
    expect(row.nextBatchAt).toBeNull();
    const qty = (await prisma.bid.findMany({ where: { buyerId: FMCG }, orderBy: { createdAt: 'asc' } })).map((b) => b.quantity);
    expect(qty).toEqual([50, 50, 25]);
    expect(await createDueBatches(new Date(start + 60 * DAY))).toBe(0);
  });

  it('makes each batch once when two processes run together, every round', async () => {
    for (let round = 0; round < 5; round++) {
      await prisma.transaction.deleteMany({ where: { buyerId: FMCG } });
      const c = await proposeContract(FMCG, { listingId: lotId, ...terms, startsAt: new Date(Date.now() + DAY).toISOString() });
      await respondToContract(c.id, FARM, true);
      const at = new Date(Date.now() + 2 * DAY);
      const [a, b] = await Promise.all([createDueBatches(at, c.id), createDueBatches(at, c.id)]);
      expect(a + b).toBe(1);
      const batches = await prisma.listing.count({ where: { supplyContractId: c.id } });
      expect(batches).toBe(1);
    }
  });

  it('stops on cancel and keeps the batches already made', async () => {
    const c = await proposeContract(FMCG, { listingId: lotId, ...terms });
    await respondToContract(c.id, FARM, true);
    const ended = await cancelContract(c.id, FARM);
    expect(ended.status).toBe('CANCELLED');
    expect(ended.endedBy).toBe('SELLER');
    expect(await createDueBatches(new Date(Date.now() + 60 * DAY))).toBe(0);
    expect(await prisma.transaction.count({ where: { buyerId: FMCG } })).toBe(1);
  });
});

describe('deleting an account', () => {
  it('is refused while a contract is proposed or running, on either side', async () => {
    // The contract cascades with the user row, so a delete used to end the
    // other side's agreement without a word.
    const c = await proposeContract(FMCG, { listingId: lotId, ...terms, startsAt: new Date(Date.now() + 30 * DAY).toISOString() });
    await expect(deleteUser(FARM, 'some-admin')).rejects.toMatchObject({ statusCode: 409 });
    await respondToContract(c.id, FARM, true);
    await expect(deleteUser(FMCG, 'some-admin')).rejects.toMatchObject({ statusCode: 409 });
    expect(await prisma.supplyContract.count({ where: { id: c.id } })).toBe(1);
  });
});

describe('answering', () => {
  it('is only for the seller, once, and a decline makes no deal', async () => {
    const c = await proposeContract(FMCG, { listingId: lotId, ...terms });
    await expect(respondToContract(c.id, PROC, true)).rejects.toMatchObject({ statusCode: 403 });
    await respondToContract(c.id, FARM, false);
    await expect(respondToContract(c.id, FARM, true)).rejects.toThrow(/already/);
    expect(await prisma.transaction.count({ where: { buyerId: FMCG } })).toBe(0);
  });
});
