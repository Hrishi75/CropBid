// =============================================================================
// Currency Formatting
// =============================================================================
// WHY Intl.NumberFormat?
// India uses a unique number grouping: ₹12,34,567 (lakhs/crores system)
// instead of the Western ₹1,234,567. Intl.NumberFormat handles this
// automatically based on the locale — no manual regex needed.
//
// USAGE:
//   formatCurrency(25000, 'INR')  → "₹25,000"
//   formatCurrency(1500, 'USD')   → "$1,500"
// =============================================================================

const CURRENCY_CONFIG: Record<string, { locale: string; currency: string }> = {
  INR: { locale: 'en-IN', currency: 'INR' },
  USD: { locale: 'en-US', currency: 'USD' },
  EUR: { locale: 'en-DE', currency: 'EUR' },
  GBP: { locale: 'en-GB', currency: 'GBP' },
};

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.INR;
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
