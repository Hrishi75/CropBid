// Shared bits for the buyer-agent iOS screens — port of theme/shared/mobile-ui
// helpers (Mono, LiveDot, StatusPill, MiniChart, GridBg) to React Native.
import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { colors, design, font } from '../theme';

// Mono text (cb-mono) ────────────────────────────────────────
export function Mono({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: font.mono }, style]}>{children}</Text>;
}

// Pulsing live dot (cb-live-dot) ─────────────────────────────
export function LiveDot({ color = colors.ember, size = 7 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, { toValue: 1, duration: 1600, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

// Status pill (StatusPill) ───────────────────────────────────
type Tone = 'sage' | 'ember' | 'paper';
const TONES: Record<Tone, { bg: string; fg: string; bd: string }> = {
  sage: { bg: 'rgba(107,142,78,0.14)', fg: '#3d5a26', bd: 'rgba(107,142,78,0.28)' },
  ember: { bg: 'rgba(200,96,43,0.12)', fg: '#8a3f17', bd: 'rgba(200,96,43,0.28)' },
  paper: { bg: design.paper2, fg: design.ink2, bd: design.line },
};

export function StatusPill({ children, tone = 'sage', dot }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }]}>
      {dot ? <LiveDot size={6} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

// Eyebrow label (cb-eyebrow) ─────────────────────────────────
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

// Tiny deterministic line chart (MiniChart) ──────────────────
export function MiniChart({
  width = 100,
  height = 28,
  data,
  color = colors.text,
  fill = false,
}: {
  width?: number;
  height?: number;
  data?: number[];
  color?: string;
  fill?: boolean;
}) {
  const pts = data || [4, 6, 5, 8, 7, 10, 9, 11, 13, 12, 15];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const rng = max - min || 1;
  const path = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / rng) * (height - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill ? <Path d={`${path} L${width - 1} ${height} L1 ${height} Z`} fill={color} opacity={0.12} /> : null}
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Faint 48px grid overlay (cb-grid-bg) ───────────────────────
export function GridBg({ color = 'rgba(255,255,255,1)', opacity = 0.12 }: { color?: string; opacity?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="grid" width={48} height={48} patternUnits="userSpaceOnUse">
            <Path d="M48 0H0V48" stroke={color} strokeWidth={1} fill="none" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: font.monoSemi,
    fontSize: 10.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  eyebrow: {
    fontFamily: font.monoMed,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: design.ink3,
  },
});

export type { ViewStyle };
