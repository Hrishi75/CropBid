// =============================================================================
// Agri-input catalogue tests
// =============================================================================
// Same job as equipmentCatalogue.test.ts: the catalogue is hand-edited product
// data that two writers consume (seed.ts and seedAgriInputs.ts), and a bad row
// fails at INSERT time against a real database — which for seedAgriInputs.ts
// means halfway through a production load.
//
// This catalogue carries one class of mistake the equipment one cannot: a row
// whose supplier lacks the licence for its category. That row loads without
// error and then never appears, because agriInput.service.ts filters it out.
// A silent no-op is worse than a crash, so it gets its own assertion below.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { INPUT_SUPPLIERS, AGRI_INPUT_CATALOGUE } from './agriInputCatalogue';

// Mirrors the SELLABLE filter in agriInput.service.ts. ORGANIC, MICRONUTRIENT
// and SEEDLING are ungated: they are not controlled categories.
const LICENCE_FOR: Record<string, 'seedLicence' | 'fertiliserLicence' | 'pesticideLicence' | null> = {
  SEED: 'seedLicence',
  FERTILISER: 'fertiliserLicence',
  CROP_PROTECTION: 'pesticideLicence',
  ORGANIC: null,
  MICRONUTRIENT: null,
  SEEDLING: null,
};

describe('agri-input catalogue', () => {
  it('gives every product a supplier that exists', () => {
    // seedAgriInputs.ts throws on a miss, but it throws mid-load with rows
    // already written. Fail here instead.
    const names = new Set(INPUT_SUPPLIERS.map((s) => s.name));
    const orphans = AGRI_INPUT_CATALOGUE.filter((p) => !names.has(p.supplier));
    expect(orphans.map((p) => `${p.title} → ${p.supplier}`)).toEqual([]);
  });

  it('identifies each supplier uniquely by (name, state)', () => {
    // The database key both writers upsert on. A duplicate here would make the
    // second upsert overwrite the first rather than add a partner.
    const keys = INPUT_SUPPLIERS.map((s) => `${s.name}|${s.state}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never repeats a supplier name, even across states', () => {
    // Stricter than the database constraint on purpose. A product points at its
    // supplier by name alone, so the loader resolves names through a name-keyed
    // map; two suppliers sharing a name in different states would collide there
    // and silently attach every one of their products to whichever was loaded
    // last — routing enquiries to the wrong shop, and worse here than in the
    // equipment catalogue, because the two shops hold different licences.
    const names = INPUT_SUPPLIERS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('identifies each product uniquely by (supplier, title)', () => {
    const keys = AGRI_INPUT_CATALOGUE.map((p) => `${p.supplier}|${p.title}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only lists controlled products under a supplier licensed for them', () => {
    // THE IMPORTANT ONE. A row failing this loads cleanly and is then hidden
    // forever by the service's licence gate, so nothing downstream complains —
    // the product simply never appears and nobody knows why.
    const byName = new Map(INPUT_SUPPLIERS.map((s) => [s.name, s]));
    const invisible = AGRI_INPUT_CATALOGUE.filter((p) => {
      const needed = LICENCE_FOR[p.category];
      if (!needed) return false;
      return !byName.get(p.supplier)?.[needed];
    });
    expect(invisible.map((p) => `${p.title} (${p.category}) → ${p.supplier}`)).toEqual([]);
  });

  it('prices every product above zero', () => {
    const bad = AGRI_INPUT_CATALOGUE.filter((p) => !(p.pricePerPack > 0));
    expect(bad.map((p) => p.title)).toEqual([]);
  });

  it('gives every product a pack size', () => {
    // The card reads "₹1,350 / 50 kg bag". Without the second half the price is
    // meaningless — a farmer cannot tell ₹420 a bag from ₹420 a tonne.
    const sizeless = AGRI_INPUT_CATALOGUE.filter((p) => !p.packSize.trim());
    expect(sizeless.map((p) => p.title)).toEqual([]);
  });

  it('names at least one crop for every product', () => {
    // The crop chips are built from this, and it is the primary filter on the
    // page. A product naming no crop is unreachable by the main navigation.
    const cropless = AGRI_INPUT_CATALOGUE.filter((p) => p.cropNames.length === 0);
    expect(cropless.map((p) => p.title)).toEqual([]);
  });

  it('states a dose per acre for every product', () => {
    // "How much do I buy" is the question the price alone never answers, and it
    // is the one thing a shop counter would always tell you.
    const doseless = AGRI_INPUT_CATALOGUE.filter((p) => !p.dosagePerAcre);
    expect(doseless.map((p) => p.title)).toEqual([]);
  });

  it('gives every seed a germination percentage', () => {
    // A certified seed bag carries a germination figure on its tag by law, and
    // the detail panel tells the farmer to check the bag matches. Shipping a
    // seed row without one makes that instruction impossible to follow.
    const untagged = AGRI_INPUT_CATALOGUE.filter(
      (p) => p.category === 'SEED' && p.germinationPct == null,
    );
    expect(untagged.map((p) => p.title)).toEqual([]);
  });

  it('keeps a price-controlled fertiliser in the catalogue', () => {
    // Guards the `subsidised` badge and the "government-set price" block: if
    // every controlled row disappeared, that whole branch would stop being
    // observable in seeded data.
    expect(AGRI_INPUT_CATALOGUE.some((p) => p.subsidised)).toBe(true);
  });

  it('keeps an unlicensed supplier in the catalogue', () => {
    // Guards the licence gate the same way. A supplier holding no licence at
    // all is what proves, in seeded data, that the gate has something to act
    // on — and it is why adding a SEED row to that shop is caught above.
    const unlicensed = INPUT_SUPPLIERS.filter(
      (s) => !s.seedLicence && !s.fertiliserLicence && !s.pesticideLicence,
    );
    expect(unlicensed.length).toBeGreaterThan(0);
  });
});
