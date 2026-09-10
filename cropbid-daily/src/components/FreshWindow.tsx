// The Fresh lane's cutoff, shown wherever a shopper is deciding on it.
//
// Ticks once a minute rather than once a second: the countdown is rendered to
// the minute, so a per-second timer would re-render sixty times for every
// visible change. The first tick is aligned to the next minute boundary so the
// number changes when the clock does, not up to 59 seconds late.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconClock } from './icons';
import { freshWindowLabel, msUntilCutoff } from '../lib/freshWindow';
import { colors, design, font, radius, spacing } from '../theme';

export function FreshWindow() {
  const [now, setNow] = useState(() => new Date());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const schedule = () => {
      const msToNextMinute = 60000 - (Date.now() % 60000);
      timer.current = setTimeout(() => {
        if (cancelled) return;
        setNow(new Date());
        schedule();
      }, msToNextMinute);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const closed = msUntilCutoff(now) <= 0;

  return (
    <View style={styles.strip}>
      <View style={styles.icon}>
        <IconClock size={14} color={colors.forest} />
      </View>
      <Text style={styles.label}>
        {closed ? "Today's batch has closed" : freshWindowLabel(now)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: design.mint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.wheat,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontFamily: font.sansSemi, fontSize: 13, color: colors.forest },
});
