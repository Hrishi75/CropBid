// The rates carry the newest arrival_date the government feed has reported
// (DD/MM/YYYY), not the calendar date. Mornings, and any day data.gov.in is
// down, that is yesterday or earlier, so "Today's" is only true when the two
// match. Same rule as client/src/utils/ratesDate.ts.
//
// IST is worked out by offset rather than Intl's timeZone option, which
// Hermes does not support on every Android build. India has no DST.

const IST_OFFSET_MS = 330 * 60 * 1000;

function todayIST(): string {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function isToday(date: string): boolean {
  return date === todayIST();
}

/**
 * The translation key for the rates title: "Mandi rates" before the date is
 * known, "Today's mandi rates" when the rates are today's, "Latest mandi
 * rates" otherwise.
 */
export function ratesTitleKey(date: string | null | undefined): string {
  if (!date) return 'Mandi rates';
  return isToday(date) ? "Today's mandi rates" : 'Latest mandi rates';
}
