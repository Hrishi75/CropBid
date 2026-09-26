// The rates carry the newest arrival_date the government feed has reported
// (DD/MM/YYYY), not the calendar date. Mornings, and any day data.gov.in is
// down, that is yesterday or earlier, so "Today's" is only true when the two
// match. Reference prices (live: false) are stamped with today's date by the
// server but come from no report, so they never get "Today's". Same rule as
// client/src/utils/ratesDate.ts.
//
// IST is worked out by offset rather than Intl's timeZone option, which
// Hermes does not support on every Android build. India has no DST.

import { useEffect, useState } from 'react';

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function todayIST(): string {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Today's date in IST, re-rendering at IST midnight so an open screen does not keep calling yesterday "today". */
function useTodayIST(): string {
  const [today, setToday] = useState(todayIST);
  useEffect(() => {
    const now = Date.now() + IST_OFFSET_MS;
    const untilMidnight = DAY_MS - (now % DAY_MS);
    const timer = setTimeout(() => setToday(todayIST()), untilMidnight + 1000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

export interface RatesStamp { date: string; live: boolean }

/**
 * The translation key for the rates title: "Today's mandi rates" when the
 * rates came from today's report, "Latest mandi rates" from an older one,
 * and "Mandi rates" before they load or when they are reference prices.
 */
export function useRatesTitleKey(stamp: RatesStamp | null): string {
  const today = useTodayIST();
  if (!stamp?.live) return 'Mandi rates';
  return stamp.date === today ? "Today's mandi rates" : 'Latest mandi rates';
}
