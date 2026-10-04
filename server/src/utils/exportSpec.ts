// =============================================================================
// Export requests: the ports, the documents, and the rules for both
// =============================================================================
// An exporter's request differs from a processor's in what the seller has to
// meet: the goods land at a port rather than a factory, dry enough to ship,
// packed the way the exporter ships them, with paperwork the exporter needs to
// clear them. This file is the one statement of those choices. The app reads
// the lists from GET /requirements/export-options and keeps no copy.
//
// THE PORT IS THE DELIVERY ADDRESS. An export request's deliveryLocation and
// deliveryState are written from the port here, never taken from the request,
// so the two cannot disagree and a seller sees one place to deliver to.
//
// THE DOCUMENTS ARE THE SELLER'S. The phytosanitary certificate, the
// certificate of origin and the shipping bill are the exporter's own filings;
// asking a farmer for them would be asking for something they cannot produce.
// =============================================================================

import { ApiError } from './ApiError';

export const EXPORT_PORTS = [
  { code: 'JNPT', name: 'Nhava Sheva (JNPT)', city: 'Navi Mumbai', state: 'Maharashtra' },
  { code: 'MUNDRA', name: 'Mundra', city: 'Mundra', state: 'Gujarat' },
  { code: 'KANDLA', name: 'Kandla', city: 'Kandla', state: 'Gujarat' },
  { code: 'CHENNAI', name: 'Chennai', city: 'Chennai', state: 'Tamil Nadu' },
  { code: 'TUTICORIN', name: 'Tuticorin', city: 'Thoothukudi', state: 'Tamil Nadu' },
  { code: 'KOCHI', name: 'Kochi', city: 'Kochi', state: 'Kerala' },
  { code: 'VIZAG', name: 'Visakhapatnam', city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  { code: 'KOLKATA', name: 'Kolkata', city: 'Kolkata', state: 'West Bengal' },
] as const;

export const EXPORT_DOCS = [
  { code: 'LAB_REPORT', label: 'Lab report: pesticide residue and quality' },
  { code: 'ORGANIC_CERT', label: 'Organic certificate (NPOP)' },
  { code: 'GST_INVOICE', label: 'GST invoice' },
] as const;

export type ExportPortCode = typeof EXPORT_PORTS[number]['code'];
export type ExportDocCode = typeof EXPORT_DOCS[number]['code'];

export const PORT_CODES = EXPORT_PORTS.map((p) => p.code) as [ExportPortCode, ...ExportPortCode[]];
export const DOC_CODES = EXPORT_DOCS.map((d) => d.code) as [ExportDocCode, ...ExportDocCode[]];

/** Moisture limits a seller can be held to, in percent. */
export const MOISTURE_RANGE = { min: 1, max: 30 };

export interface ExportInput {
  forExport?: boolean;
  exportPort?: ExportPortCode;
  maxMoisturePct?: number | null;
  packing?: string | null;
  requiredDocs?: ExportDocCode[];
}

/**
 * The export columns to write, and the delivery address they imply.
 *
 * Not for export: every export column cleared, and the caller's own delivery
 * address kept. For export: a port is required and becomes the address.
 */
export function exportFields(input: ExportInput, organic: boolean) {
  if (!input.forExport) {
    return {
      fields: { forExport: false, exportPort: null, maxMoisturePct: null, packing: null, requiredDocs: [] as string[] },
      delivery: null,
    };
  }

  const port = EXPORT_PORTS.find((p) => p.code === input.exportPort);
  if (!port) throw new ApiError(400, 'Choose the port the goods should reach');

  let moisture: number | null = null;
  if (input.maxMoisturePct != null) {
    moisture = Number(input.maxMoisturePct);
    if (!Number.isFinite(moisture) || moisture < MOISTURE_RANGE.min || moisture > MOISTURE_RANGE.max) {
      throw new ApiError(400, `Moisture limit should be between ${MOISTURE_RANGE.min}% and ${MOISTURE_RANGE.max}%`);
    }
    moisture = Math.round(moisture * 10) / 10;
  }

  const docs = [...new Set(input.requiredDocs ?? [])];
  // An organic certificate for a lot that need not be organic is a request no
  // conventional seller can meet, so the two have to agree.
  if (docs.includes('ORGANIC_CERT') && !organic) {
    throw new ApiError(400, 'Ask for an organic certificate only on an organic request');
  }

  return {
    fields: {
      forExport: true,
      exportPort: port.code,
      maxMoisturePct: moisture,
      packing: input.packing?.trim().slice(0, 200) || null,
      requiredDocs: docs as string[],
    },
    delivery: { deliveryLocation: port.city, deliveryState: port.state, deliveryCountry: 'India' },
  };
}
