// Small shared UI primitives so screens stay readable.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, statusColor } from '../theme';

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}) {
  const isOutline = variant === 'outline';
  const blocked = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.btn,
        isOutline ? styles.btnOutline : styles.btnPrimary,
        blocked && styles.btnDisabled,
        pressed && !blocked && styles.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.forest : colors.textInverse} />
      ) : (
        <Text style={[styles.btnText, isOutline && styles.btnTextOutline]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Badge({ status }: { status: string }) {
  const bg = statusColor[status] ?? colors.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

export function Loading({ label }: { label?: string }) {
  return (
    <Center>
      <ActivityIndicator size="large" color={colors.sage} />
      {label ? <Text style={styles.muted}>{label}</Text> : null}
    </Center>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimary: { backgroundColor: colors.forest },
  btnOutline: { borderWidth: 1.5, borderColor: colors.forest, backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  btnText: { color: colors.textInverse, fontWeight: '600', fontSize: 16 },
  btnTextOutline: { color: colors.forest },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  badgeText: { color: colors.textInverse, fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { color: colors.textMuted, marginTop: spacing.md },
});
