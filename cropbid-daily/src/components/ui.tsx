// Shared primitives. Still deliberately small: Daily has two screens, and a
// component library built ahead of the screens that need it guesses wrong.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { colors, design, font, radius, shadow, spacing } from '../theme';

/**
 * The first frame, shown while the fonts load.
 *
 * Painted in the brand's own colours rather than left white, because this is
 * the handover from the native splash screen: a white flash between the two
 * reads as the app stalling on launch.
 */
export function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.splashMark}>CropBid</Text>
      <Text style={styles.splashSub}>Daily</Text>
    </View>
  );
}

/** Monospace label, for prices and eyebrow text. */
export function Mono({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[styles.mono, style]} />;
}

/** All-caps section label. The one place letter-spacing earns its keep. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Mono style={styles.section}>{children}</Mono>;
}

/**
 * A pulsing placeholder block.
 *
 * Shown instead of a spinner because the shop list has a KNOWN shape: cards of
 * a fixed height in a single column. Drawing that shape while it loads means
 * the screen does not jump when data lands, and a shopper can already see how
 * much is coming.
 */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.skeleton, style, { opacity: pulse }]} />;
}

/** The shop list's loading state, drawn in the shape of the cards it replaces. */
export function ShopListSkeleton() {
  return (
    <View>
      <Skeleton style={styles.skLabel} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skCard}>
          <Skeleton style={styles.skThumb} />
          <View style={styles.skBody}>
            <Skeleton style={styles.skLine} />
            <Skeleton style={styles.skLineShort} />
            <Skeleton style={styles.skPills} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** An empty state. Says which of the two things happened. */
export function Empty({ title, body, icon }: { title: string; body?: string; icon?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/**
 * A failed fetch, told apart from an empty result.
 *
 * "No shops here" and "we could not reach the server" are different facts and a
 * shopper acts differently on each, so they never share a screen state.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Could not load</Text>
      <Text style={styles.emptyBody}>{message}</Text>
      {onRetry ? (
        <Text onPress={onRetry} style={styles.retry}>
          Try again
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Small rounded chip.
 *
 * `solid` fills it with the tone for the one chip on a card that should be read
 * first; the outline version is for everything else. More than one solid chip
 * in a row and neither gets read.
 */
export function Pill({
  label,
  tone = colors.sage,
  icon,
  solid = false,
}: {
  label: string;
  tone?: string;
  icon?: React.ReactNode;
  solid?: boolean;
}) {
  return (
    <View
      style={[
        styles.pill,
        solid ? { backgroundColor: tone, borderColor: tone } : { borderColor: tone },
      ]}
    >
      {icon}
      <Mono style={[styles.pillText, { color: solid ? colors.surface : tone }]}>{label}</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
  // No custom family: this renders before the fonts are ready, by definition.
  splashMark: { fontSize: 30, fontWeight: '700', color: colors.surface, letterSpacing: -0.5 },
  splashSub: { fontSize: 15, color: colors.sage2, marginTop: 2, letterSpacing: 3, textTransform: 'uppercase' },

  mono: { fontFamily: font.mono, fontSize: 12, color: design.ink2 },
  section: { fontSize: 10, letterSpacing: 1.2, color: design.ink3 },

  skeleton: { backgroundColor: design.paper2, borderRadius: radius.sm },
  skLabel: { height: 10, width: 130, marginBottom: spacing.md },
  skCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: design.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  skThumb: { width: 92, height: 92, borderRadius: radius.md },
  skBody: { flex: 1, justifyContent: 'center', gap: 9 },
  skLine: { height: 15, width: '75%' },
  skLineShort: { height: 11, width: '52%' },
  skPills: { height: 20, width: '64%', borderRadius: radius.pill },

  empty: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.xs, alignItems: 'flex-start' },
  emptyIcon: { marginBottom: spacing.md, opacity: 0.4 },
  emptyTitle: { fontFamily: font.sansSemi, fontSize: 17, color: design.ink, marginBottom: 6 },
  emptyBody: { fontFamily: font.sans, fontSize: 14, color: design.ink3, lineHeight: 21 },
  retry: {
    marginTop: spacing.md,
    fontFamily: font.sansSemi,
    fontSize: 14,
    color: colors.forest,
    textDecorationLine: 'underline',
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 4,
  },
  pillText: { fontSize: 10, letterSpacing: 0.3 },
});
