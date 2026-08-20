// =============================================================================
// Company type labels — BuyerProfile.companyType, in words
// =============================================================================
// Lives in utils rather than beside RequirementCard because the public demand
// page needs the same labels and must not pull a dashboard component (and its
// i18n/router dependencies) into the prerendered bundle to get them.
// =============================================================================

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
