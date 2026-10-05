// =============================================================================
// Export requests, against a real Postgres
// =============================================================================
// What has to hold: the port becomes the delivery address whatever the request
// says, an export request cannot be posted without one, a seller cannot be
// asked for an organic certificate on a conventional lot, and a request that
// is not for export carries no export details at all.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Posting fans out notifications; nothing here is about them.
vi.mock('./notification.service', () => ({ createNotification: vi.fn(() => Promise.resolve({})) }));

import { prisma } from '../lib/prisma';
import { createRequirement } from './requirement.service';

const BUYER = 'export-req-buyer';

const base = {
  cropName: 'Export Test Turmeric',
  quantity: 200,
  unit: 'QUINTAL' as const,
  qualityGrade: 'A' as const,
  pricePerUnit: 9000,
  deliveryLocation: 'Somewhere else',
  deliveryState: 'Bihar',
};

async function clean() {
  await prisma.buyerRequirement.deleteMany({ where: { buyerId: BUYER } });
  await prisma.user.deleteMany({ where: { id: BUYER } });
}

beforeAll(async () => {
  await clean();
  await prisma.user.create({
    data: {
      id: BUYER, name: 'Exporter', email: `${BUYER}@test.local`, password: 'x', role: 'BUYER', phone: '9800000099',
      buyerProfile: { create: { companyName: 'Spice Exports', companyType: 'EXPORTER', status: 'APPROVED' } },
    },
  });
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('an export request', () => {
  it('delivers to the port, not to the address it was sent with', async () => {
    const r = await createRequirement(BUYER, {
      ...base, forExport: true, exportPort: 'CHENNAI', maxMoisturePct: 10.04,
      packing: '  50 kg new jute bags ', requiredDocs: ['LAB_REPORT', 'LAB_REPORT', 'GST_INVOICE'],
    });
    expect(r.forExport).toBe(true);
    expect(r.exportPort).toBe('CHENNAI');
    expect(r.deliveryLocation).toBe('Chennai');
    expect(r.deliveryState).toBe('Tamil Nadu');
    expect(r.maxMoisturePct).toBe(10);
    expect(r.packing).toBe('50 kg new jute bags');
    expect(r.requiredDocs).toEqual(['LAB_REPORT', 'GST_INVOICE']);
  });

  it('needs a port', async () => {
    await expect(createRequirement(BUYER, { ...base, forExport: true })).rejects.toThrow(/port/);
  });

  it('refuses a moisture limit outside the range', async () => {
    await expect(createRequirement(BUYER, { ...base, forExport: true, exportPort: 'KOCHI', maxMoisturePct: 45 }))
      .rejects.toThrow(/Moisture/);
  });

  it('asks for an organic certificate only on an organic request', async () => {
    await expect(createRequirement(BUYER, {
      ...base, forExport: true, exportPort: 'KOCHI', requiredDocs: ['ORGANIC_CERT'],
    })).rejects.toThrow(/organic/);
    const ok = await createRequirement(BUYER, {
      ...base, organic: true, forExport: true, exportPort: 'KOCHI', requiredDocs: ['ORGANIC_CERT'],
    });
    expect(ok.requiredDocs).toEqual(['ORGANIC_CERT']);
  });
});

describe('a request that is not for export', () => {
  it('keeps its own address and carries no export details, even if sent some', async () => {
    const r = await createRequirement(BUYER, {
      ...base, exportPort: 'JNPT', maxMoisturePct: 12, packing: 'bags', requiredDocs: ['LAB_REPORT'],
    });
    expect(r.forExport).toBe(false);
    expect(r.deliveryLocation).toBe('Somewhere else');
    expect(r.exportPort).toBeNull();
    expect(r.maxMoisturePct).toBeNull();
    expect(r.packing).toBeNull();
    expect(r.requiredDocs).toEqual([]);
  });
});
