// =============================================================================
// Equipment catalogue tests
// =============================================================================
// The catalogue is hand-edited product data that two writers consume
// (seed.ts and seedEquipment.ts), and a bad row fails at INSERT time against a
// real database — which for seedEquipment.ts means halfway through a
// production load. These assertions catch the mistakes cheaply instead.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { EQUIPMENT_DEALERS, EQUIPMENT_CATALOGUE } from './equipmentCatalogue';

describe('equipment catalogue', () => {
  it('gives every machine a dealer that exists', () => {
    // seedEquipment.ts throws on a miss, but it throws mid-load with rows
    // already written. Fail here instead.
    const names = new Set(EQUIPMENT_DEALERS.map((d) => d.name));
    const orphans = EQUIPMENT_CATALOGUE.filter((e) => !names.has(e.dealer));
    expect(orphans.map((e) => `${e.title} → ${e.dealer}`)).toEqual([]);
  });

  it('identifies each dealer uniquely by (name, state)', () => {
    // The database key both writers upsert on. A duplicate here would make the
    // second upsert overwrite the first rather than add a partner.
    const keys = EQUIPMENT_DEALERS.map((d) => `${d.name}|${d.state}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never repeats a dealer name, even across states', () => {
    // Stricter than the database constraint on purpose. A machine points at
    // its dealer by name alone, so the loader resolves names through a
    // name-keyed map; two dealers sharing a name in different states would
    // collide in that map and silently attach every one of their machines to
    // whichever was loaded last — routing enquiries to the wrong partner.
    // Give one of them a distinguishing name, e.g. "… (Nashik)".
    const names = EQUIPMENT_DEALERS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('identifies each machine uniquely by (dealer, title)', () => {
    // Same reason: it is the key seedEquipment.ts updates on, so a duplicate
    // would leave one of the pair permanently stale.
    const keys = EQUIPMENT_CATALOGUE.map((e) => `${e.dealer}|${e.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prices every machine on the rate its mode implies', () => {
    // equipment.service.ts validates this same rule on write, and both clients
    // fall back to "Ask dealer" when the rate is missing — a priceless row is
    // a dead card in the catalogue.
    const unpriced = EQUIPMENT_CATALOGUE.filter((e) => {
      const needsSale = e.mode === 'SALE' || e.mode === 'BOTH';
      const needsRent = e.mode === 'RENT' || e.mode === 'BOTH';
      if (needsSale && e.salePrice == null) return true;
      if (needsRent && e.rentPricePerDay == null && e.rentPricePerHour == null) return true;
      return false;
    });
    expect(unpriced.map((e) => e.title)).toEqual([]);
  });

  it('keeps an hourly-only rental in the catalogue', () => {
    // Guards the browse filter: a maxPrice search on RENT once matched
    // rentPricePerDay alone, which hid rows priced by the hour. If this row
    // ever disappears, that regression stops being observable in seeded data.
    const hourlyOnly = EQUIPMENT_CATALOGUE.filter(
      (e) => e.rentPricePerHour != null && e.rentPricePerDay == null,
    );
    expect(hourlyOnly.length).toBeGreaterThan(0);
  });

  it('states a positive price wherever it states one at all', () => {
    const nonPositive = EQUIPMENT_CATALOGUE.filter((e) =>
      [e.salePrice, e.rentPricePerDay, e.rentPricePerHour, e.securityDeposit]
        .some((v) => v != null && v <= 0),
    );
    expect(nonPositive.map((e) => e.title)).toEqual([]);
  });

  it('describes every machine with at least one spec', () => {
    const specless = EQUIPMENT_CATALOGUE.filter((e) => e.specs.length === 0);
    expect(specless.map((e) => e.title)).toEqual([]);
  });

  it('dates every used machine', () => {
    // The clients show "USED · 2022"; a missing year renders a bare "USED",
    // which reads as evasive on a listing costing lakhs.
    const undated = EQUIPMENT_CATALOGUE.filter((e) => e.condition === 'USED' && e.yearMade == null);
    expect(undated.map((e) => e.title)).toEqual([]);
  });
});
