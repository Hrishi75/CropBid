// Company-type labels — BuyerProfile.companyType, in words. Mirrors
// client/src/utils/companyType.ts, and kept in lib rather than beside
// RequirementCard because the demand board, the card and the post form all read
// it.

export const COMPANY_TYPE_LABEL: Record<string, string> = {
  PROCESSOR: 'Processor',
  FMCG: 'FMCG',
  RESTAURANT: 'Restaurant chain',
  EXPORTER: 'Exporter',
  RETAILER: 'Retail chain',
  WHOLESALER: 'Wholesaler',
  SMALL_BUSINESS: 'Small business',
};

/** The label, falling back to the raw enum value for anything unmapped. */
export function companyTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return COMPANY_TYPE_LABEL[type] || type;
}
