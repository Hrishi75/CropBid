// The rates board carries the newest arrival_date the government feed has
// reported (DD/MM/YYYY), not the calendar date. Mornings, and any day
// data.gov.in is down, that is yesterday or earlier, so "Today's" is only
// true when the two match. Reference prices (live: false) are stamped with
// today's date by the server but come from no report, so they get neither
// "Today's" nor a date. Compared in IST, because that is the feed's day.

import { useEffect, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 330 * 60 * 1000; // India has no DST
const DAY_MS = 24 * 60 * 60 * 1000;

function todayIST(): string {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Today's date in IST, re-rendering at IST midnight so an open page does not keep calling yesterday "today". */
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

/** "25/09/2026" → "25 Sep". Anything unparseable is returned as it came. */
export function shortDate(date: string): string {
  const [dd, mm] = date.split('/');
  const month = MONTHS[Number(mm) - 1];
  return dd && month ? `${Number(dd)} ${month}` : date;
}

export interface RatesHeading {
  /** "Today's mandi rates", "Latest mandi rates", or "Mandi rates" when there is no report. */
  title: string;
  /** "26 Sep" today, "reported 25 Sep" when older, "" when there is no report. */
  date: string;
  /** The rates came from a report, and it is today's. */
  current: boolean;
}

export function useRatesHeading(board: { date: string; live: boolean } | null): RatesHeading {
  const today = useTodayIST();
  if (!board?.live) return { title: 'Mandi rates', date: '', current: false };
  const current = board.date === today;
  return {
    title: current ? "Today's mandi rates" : 'Latest mandi rates',
    date: current ? shortDate(board.date) : `reported ${shortDate(board.date)}`,
    current,
  };
}
