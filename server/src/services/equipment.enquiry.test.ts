// =============================================================================
// One equipment lead per account, per machine, per intent
// =============================================================================
// Nothing stopped the same account raising the same enquiry over and over, so
// the lead table could be filled with copies and a dealer shown the same
// farmer ten times. /inputs has had the guard since it shipped; this is the
// matching one.
//
// Against a REAL Postgres, because the guard is a unique index: a mocked
// client would only prove this file calls itself. What has to hold:
//
//   1. The first enquiry creates a lead and says so.
//   2. Asking again with the same intent hands back the lead on file, and the
//      dealer's number with it, without writing a copy.
//   3. Asking with the other intent is a new lead, because a dealer acts on a
//      hire differently from a sale.
//   4. A double tap racing itself still writes one row.
// =============================================================================

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import { createEnquiry } from './equipment.service';

const FARMER = 'eq-enq-farmer';
const DEALER = 'eq-enq-dealer';
const MACHINE = 'eq-enq-machine';

async function reset() {
  await prisma.equipmentEnquiry.deleteMany({ where: { userId: FARMER } });
  await prisma.equipment.deleteMany({ where: { id: MACHINE } });
  await prisma.equipmentDealer.deleteMany({ where: { id: DEALER } });
  await prisma.user.deleteMany({ where: { id: FARMER } });
}

beforeEach(async () => {
  await reset();
  await prisma.user.create({
    data: { id: FARMER, name: 'Farmer', email: `${FARMER}@test.local`, password: 'x', role: 'FARMER' },
  });
  await prisma.equipmentDealer.create({
    data: { id: DEALER, name: 'Equipment Enquiry Test Dealer', location: 'Pune', state: 'Maharashtra', contactPhone: '9800000000' },
  });
  // Offered for both, so both intents are legitimate asks.
  await prisma.equipment.create({
    data: {
      id: MACHINE, dealerId: DEALER, title: 'Mahindra 575 DI', category: 'TRACTOR',
      mode: 'BOTH', location: 'Pune', state: 'Maharashtra',
    },
  });
});

afterAll(reset);

const leads = () => prisma.equipmentEnquiry.count({ where: { userId: FARMER } });

describe('raising an equipment enquiry', () => {
  it('creates the lead the first time, and says so', async () => {
    const result = await createEnquiry(MACHINE, FARMER, { intent: 'SALE' });

    expect(result.created).toBe(true);
    expect(result.dealer.contactPhone).toBe('9800000000');
    expect(await leads()).toBe(1);
  });

  // They earned the number the first time; asking again must not put a
  // second copy of the same lead in front of the dealer.
  it('hands back the lead on file when asked again, and writes no copy', async () => {
    const first = await createEnquiry(MACHINE, FARMER, { intent: 'SALE', message: 'Cash buyer' });
    const again = await createEnquiry(MACHINE, FARMER, { intent: 'SALE', message: 'Still interested?' });

    expect(again.created).toBe(false);
    expect(again.enquiry.id).toBe(first.enquiry.id);
    expect(again.dealer.contactPhone).toBe('9800000000');
    expect(await leads()).toBe(1);
  });

  // The dealer may already have called about the first message. Silently
  // changing it would leave the lead saying something nobody discussed.
  it('does not overwrite what the dealer was first told', async () => {
    await createEnquiry(MACHINE, FARMER, { intent: 'SALE', message: 'Cash buyer' });
    await createEnquiry(MACHINE, FARMER, { intent: 'SALE', message: 'Actually, on finance' });

    const onFile = await prisma.equipmentEnquiry.findFirstOrThrow({ where: { userId: FARMER } });
    expect(onFile.message).toBe('Cash buyer');
  });

  // Why intent is in the key: a farmer who asked to buy and now wants to hire
  // must reach the dealer again, not be handed back their own offer to buy.
  it('treats hiring as a separate lead from buying', async () => {
    const buy = await createEnquiry(MACHINE, FARMER, { intent: 'SALE' });
    const hire = await createEnquiry(MACHINE, FARMER, {
      intent: 'RENT', rentFrom: '2026-10-01', rentTo: '2026-10-05',
    });

    expect(hire.created).toBe(true);
    expect(hire.enquiry.id).not.toBe(buy.enquiry.id);
    expect(hire.enquiry.intent).toBe('RENT');
    expect(await leads()).toBe(2);
  });

  // A double tap on a slow connection. A look-before-insert passes both taps;
  // the index is what makes it one row. Looped, because the first pair in a
  // fresh process spends its time opening connections and accidentally
  // serialises, so a single round proves nothing.
  it('writes one row when the same enquiry races itself, over and over', async () => {
    for (let round = 0; round < 10; round += 1) {
      await prisma.equipmentEnquiry.deleteMany({ where: { userId: FARMER } });

      const results = await Promise.all([
        createEnquiry(MACHINE, FARMER, { intent: 'SALE' }),
        createEnquiry(MACHINE, FARMER, { intent: 'SALE' }),
        createEnquiry(MACHINE, FARMER, { intent: 'SALE' }),
      ]);

      expect(await leads()).toBe(1);
      // Exactly one of them created it; the others got it back.
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.enquiry.id)).size).toBe(1);
    }
  });
});
