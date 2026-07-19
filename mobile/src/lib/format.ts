// Display formatting helpers shared across screens: currency (money), unit
// labels (unitLabel), and relative timestamps (timeAgo). Pure functions, no deps.

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export function money(amount: number, currency = 'INR'): string {
  const symbol = SYMBOLS[currency] ?? '';
  return `${symbol}${Math.round(amount).toLocaleString('en-IN')}`;
}

export function unitLabel(unit: string): string {
  if (unit === 'QUINTAL') return 'qtl';
  if (unit === 'LITRE') return 'L';
  return unit.toLowerCase();
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
