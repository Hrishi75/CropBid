// =============================================================================
// FreshBanner — the countdown to midnight, and what it buys you
// =============================================================================
// A full-width strip under the lane tabs, carrying the FRESH tag, the arrival
// day, and a live HH:MM:SS clock counting down to the cutoff.
//
// THE CUTOFF IS A REAL CONSTRAINT, NOT A MARKETING COUNTDOWN. Fresh is a batch:
// everything ordered during one day is bought together at the next morning's
// mandi and delivered that morning. Miss midnight and there is no second run to
// catch, the order simply joins the following day's batch. A ticking clock is
// honest here in a way it would not be on a discount that resets.
//
// IT NAMES THE ARRIVAL DAY, not "tomorrow". Ordering at 11pm on a Sunday for
// "tomorrow morning" is ambiguous in exactly the moment the shopper most needs
// it not to be.
//
// TICKS ONCE A SECOND, because it shows seconds. The earlier version ticked
// once a minute, which was right when it read "4h 27m": sixty renders per
// visible change is waste. Showing SS makes the second the visible unit, so the
// cost is now buying something. It is one small component with no children, and
// the interval is cleared on unmount.
//
// AT 00:00:00 IT ROLLS OVER RATHER THAN STOPPING. `cutoffAfter` is recomputed
// from the current time on every tick, so the instant the window shuts it
// reopens on the next midnight and the arrival day advances with it. There is
// no dead state to design, because there is never a moment with no next batch.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mono } from './buyerKit';
import { deliveryMorning, formatDeliveryDay, remaining } from '../lib/freshWindow';
import { colors, design, font, radius, spacing } from '../theme';

export function FreshBanner() {
  const [now, setNow] = useState(() => new Date());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Every tick reads the wall clock rather than incrementing a counter, so a
    // slow interval or a backgrounded app resumes on the right number instead
    // of accumulating drift.
    timer.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const { hh, mm, ss } = remaining(now);
  const day = formatDeliveryDay(deliveryMorning(now));

  return (
    <View style={styles.bar}>
      <View style={styles.top}>
        <View style={styles.tag}>
          <Mono style={styles.tagText}>FRESH</Mono>
        </View>
        <Text style={styles.title} numberOfLines={1}>At your door {day} morning</Text>
      </View>

      <View style={styles.clockRow}>
        <View style={styles.clock}>
          <Digit value={hh} label="HRS" />
          <Text style={styles.colon}>:</Text>
          <Digit value={mm} label="MIN" />
          <Text style={styles.colon}>:</Text>
          <Digit value={ss} label="SEC" />
        </View>
        <Text style={styles.cutoff}>
          left to order{'\n'}
          <Text style={styles.cutoffStrong}>before 12 am</Text>
        </Text>
      </View>
    </View>
  );
}

/**
 * One two-digit box.
 *
 * Fixed width rather than hugging its text, so the row does not shuffle
 * sideways as digits change. Monospace for the same reason: in a proportional
 * face "11" is visibly narrower than "00" and the colons would wander.
 */
function Digit({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.digitWrap}>
      <View style={styles.digitBox}>
        <Text style={styles.digit}>{value}</Text>
      </View>
      <Mono style={styles.digitLabel}>{label}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: design.mint,
    borderWidth: 1,
    borderColor: 'rgba(107,142,78,0.28)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },

  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: {
    backgroundColor: colors.forest,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { fontSize: 9, letterSpacing: 0.8, color: colors.surface },
  title: { flex: 1, fontFamily: font.sansSemi, fontSize: 13.5, color: design.ink },

  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  clock: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  digitWrap: { alignItems: 'center' },
  digitBox: {
    backgroundColor: colors.forest,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    minWidth: 38,
    alignItems: 'center',
  },
  digit: {
    fontFamily: font.monoSemi,
    fontSize: 19,
    color: colors.surface,
    letterSpacing: 0.5,
  },
  digitLabel: { fontSize: 8, letterSpacing: 0.6, color: design.ink3, marginTop: 3 },
  // Nudged up so it sits against the digits rather than the labels below them.
  colon: {
    fontFamily: font.monoSemi,
    fontSize: 17,
    color: colors.forest,
    paddingTop: 5,
  },

  cutoff: {
    flex: 1,
    textAlign: 'right',
    fontFamily: font.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: design.ink3,
  },
  cutoffStrong: { fontFamily: font.sansSemi, color: design.ink },
});
