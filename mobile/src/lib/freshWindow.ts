// =============================================================================
// The Fresh window — order before midnight, arrives next morning
// =============================================================================
// Quick and Fresh are not just two speeds. Quick is stock a shop already holds,
// so it can go out whenever someone orders. FRESH IS A BATCH: everything
// ordered during one day is bought together at the next morning's mandi and
// delivered that morning. One buying run, one delivery round.
//
// That makes the cutoff a real constraint rather than a marketing countdown.
// Miss midnight and there is no second mandi run to catch; the order simply
// joins the following day's batch.
//
//   Order any time on the 9th  ->  bought at the mandi on the 10th at dawn
//                              ->  delivered the morning of the 10th
//   Order 00:01 on the 10th    ->  delivered the morning of the 11th
//
// Everything here is pure and takes `now`, so the screens can render a live
// countdown and the behaviour stays testable without freezing a clock.
// =============================================================================

/**
 * The moment this day's Fresh orders close: the midnight that ENDS `now`'s
 * calendar day.
 *
 * Built by rolling the date forward and zeroing the clock rather than by adding
 * 24 hours, so it lands on real local midnight across a DST shift instead of
 * an hour either side of it.
 */
export function cutoffAfter(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 1);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

/**
 * The morning an order placed at `now` actually arrives.
 *
 * Same calendar day as the cutoff: orders placed on the 9th close at midnight
 * and land on the morning of the 10th.
 */
export function deliveryMorning(now: Date): Date {
  return cutoffAfter(now);
}

/** Milliseconds left to make this batch. Never negative. */
export function msUntilCutoff(now: Date): number {
  return Math.max(0, cutoffAfter(now).getTime() - now.getTime());
}

/**
 * The countdown, at the coarsest unit that is still honest.
 *
 * Hours while there are hours left, minutes inside the last hour. Showing
 * seconds all evening implies a precision the mandi run does not have, and
 * showing "0h" in the last minutes would read as closed when it is not.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'closed';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

/**
 * The time left, split into the digits a clock shows.
 *
 * Zero-padded strings rather than numbers, because every consumer of this is
 * rendering them into fixed-width boxes and "4" jumping to "04" as the hour
 * rolls over makes the whole row twitch.
 *
 * Hours are NOT capped at 24. The window is always less than a day, so two
 * digits is always enough, but returning the real number means a caller that
 * somehow gets a longer span shows something true rather than a wrapped value.
 */
export function remaining(now: Date): { hh: string; mm: string; ss: string; done: boolean } {
  const ms = msUntilCutoff(now);
  const total = Math.floor(ms / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { hh: pad(hh), mm: pad(mm), ss: pad(ss), done: ms <= 0 };
}

/** "Thu 10 Sep" — the day a shopper will be looking for the delivery. */
export function formatDeliveryDay(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The one line the Fresh lane leads with.
 *
 * Names the arrival day rather than saying "tomorrow": ordering at 11pm on a
 * Sunday for "tomorrow morning" is ambiguous in exactly the moment the shopper
 * most needs it not to be.
 */
export function freshWindowLabel(now: Date): string {
  const left = formatCountdown(msUntilCutoff(now));
  const day = formatDeliveryDay(deliveryMorning(now));
  return `Order within ${left} for ${day} morning`;
}
