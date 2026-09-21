// =============================================================================
// Shapes the admin inputs screens share, as /api/admin/agri-inputs sends them
// =============================================================================
// Licences arrive as on-file booleans and shops arrive without a phone number:
// the server never sends either to any client, admin included.
// =============================================================================

import { isAxiosError } from 'axios';

export type LicenceKind = 'seed' | 'fertiliser' | 'pesticide';
export type Licences = Record<LicenceKind, boolean>;

export interface AdminInput {
  id: string;
  supplierId: string;
  title: string;
  category: string;
  brand: string | null;
  cropNames: string[];
  packSize: string;
  pricePerPack: number;
  subsidised: boolean;
  composition: string | null;
  germinationPct: number | null;
  seedTreatment: string | null;
  dosagePerAcre: string | null;
  specs: string[];
  description: string | null;
  location: string;
  state: string;
  active: boolean;
  live: boolean;
  hiddenBecause: string[];
  enquiries: number;
  supplier: {
    id: string;
    name: string;
    location: string;
    state: string;
    verified: boolean;
    active: boolean;
    licences: Licences;
  };
}

export interface CategoryCount {
  id: string;
  label: string;
  /** The licence a shop needs before this category shows on /inputs. */
  licence: LicenceKind | null;
  total: number;
  live: number;
}

export interface AdminSupplier {
  id: string;
  name: string;
  location: string;
  state: string;
  verified: boolean;
  rating: number;
  active: boolean;
  licences: Licences;
  missingLicences: LicenceKind[];
  products: number;
  live: number;
}

export const LICENCE_KINDS: { key: LicenceKind; label: string; law: string }[] = [
  { key: 'seed', label: 'Seed', law: 'Seeds (Control) Order 1983' },
  { key: 'fertiliser', label: 'Fertiliser', law: 'Fertiliser (Control) Order 1985' },
  { key: 'pesticide', label: 'Pesticide', law: 'Insecticides Act 1968' },
];

/** The server's own words for a refused request, which say what to fix. */
export function apiMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const message = (err.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
