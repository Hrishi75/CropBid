// The business identifiers a partner application asks for, and what each
// must look like. One place, because the seller form, the buyer form and the
// profile editor all take some of them, and a format checked in one and not
// another is a number the reviewer cannot trust either way.
//
// FORMAT ONLY. A PAN that matches the pattern can still belong to somebody
// else; nothing here asks the issuing authority. A reviewer is looking at a
// well-formed number, not a verified one.
import { ApiError } from './ApiError';

// Typed with spaces, lower case, or the dashes people copy off a certificate.
export function normaliseId(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s-]/g, '').toUpperCase();
}

// Five letters, four digits, a letter. The fourth letter says what holds it
// (P person, C company, F firm, H HUF...), which is left unchecked: a
// proprietor's PAN is a P and their shop trades on it.
export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// State code, the holder's PAN, entity number, a Z, a check character.
export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
// Registration and licence numbers alike are 14 digits.
export const FSSAI = /^[0-9]{14}$/;
// DGFT's Importer-Exporter Code: 10 characters, and since 2018 usually the PAN.
export const IEC = /^[0-9A-Z]{10}$/;

interface Rule { pattern: RegExp; example: string; name: string }
const RULES = {
  pan: { pattern: PAN, name: 'PAN', example: '10 characters, like ABCDE1234F' },
  gstin: { pattern: GSTIN, name: 'GSTIN', example: '15 characters, like 27ABCDE1234F1Z5' },
  fssai: { pattern: FSSAI, name: 'FSSAI number', example: '14 digits' },
  iec: { pattern: IEC, name: 'IEC', example: '10 characters' },
} satisfies Record<string, Rule>;

// The normalised number, null when blank and not required, or a 400 naming
// what was wrong. `missing` is the message for a required blank, because what
// to say depends on who is asking (a shop, an exporter).
export function parseId(
  kind: keyof typeof RULES,
  value: string | null | undefined,
  missing?: string,
): string | null {
  const rule = RULES[kind];
  const id = normaliseId(value);
  if (!id) {
    if (missing) throw new ApiError(400, missing);
    return null;
  }
  if (!rule.pattern.test(id)) {
    throw new ApiError(400, `That ${rule.name} does not look right: it is ${rule.example}`);
  }
  return id;
}

// A GSTIN carries the PAN it was issued against in characters 3 to 12, so
// the two must agree. A mismatch is a typo in one of them, or two different
// businesses on one application, and either way the tax deducted on the
// seller's sales would be reported against the wrong holder.
export function assertPanMatchesGstin(pan: string | null, gstin: string | null): void {
  if (!pan || !gstin) return;
  if (gstin.slice(2, 12) !== pan) {
    throw new ApiError(400, 'Your PAN and GSTIN do not match: a GSTIN contains the PAN it was issued to');
  }
}
