// The rates board carries the newest arrival_date the government feed has
// reported (DD/MM/YYYY), not the calendar date. Mornings, and any day
// data.gov.in is down, that is yesterday or earlier, so "Today's" is only
// true when the two match. Compared in IST, because that is the feed's day.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function todayIST(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date());
}

export function isToday(date: string): boolean {
  return date === todayIST();
}

/** "25/09/2026" → "25 Sep". Anything unparseable is returned as it came. */
export function shortDate(date: string): string {
  const [dd, mm] = date.split('/');
  const month = MONTHS[Number(mm) - 1];
  return dd && month ? `${Number(dd)} ${month}` : date;
}

/** "Today's mandi rates" when the rates are today's, "Latest mandi rates" otherwise. */
export function ratesTitle(date: string): string {
  return isToday(date) ? "Today's mandi rates" : 'Latest mandi rates';
}

/** The date after the title: "26 Sep" today, "reported 25 Sep" when older. */
export function ratesDateLabel(date: string): string {
  return isToday(date) ? shortDate(date) : `reported ${shortDate(date)}`;
}
