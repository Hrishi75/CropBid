// CropBid logo marks — react-native-svg port of crop-bid/project/logos.jsx.
// Each mark renders at any size, single-color, with an optional accent dot.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, font } from '../theme';

type MarkProps = { size?: number; color?: string; accent?: string };
const INK = colors.text;
const EMBER = colors.ember;

// 01 — ARC: two agent nodes connected by an arc with a settlement dot at the apex.
export function MarkArc({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path d="M5 30C5 17 10 8 20 8s15 9 15 22" stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Circle cx={5} cy={30} r={3.6} fill={color} />
      <Circle cx={35} cy={30} r={3.6} fill={color} />
      <Circle cx={20} cy={8} r={2.6} fill={accent} />
    </Svg>
  );
}

// 02 — SPROUT: an upward chevron that doubles as a sprout and a "rising bid" arrow.
export function MarkSprout({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path d="M20 36V14" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Path d="M20 14c-6 0-9-4-9-9 5 0 9 3 9 9z" fill={color} />
      <Path d="M20 18c5 0 8-3 8-7-4 0-8 2-8 7z" fill={accent} />
    </Svg>
  );
}

// 03 — KERNEL: a seed split open with a tick rising out of it.
export function MarkKernel({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path d="M20 4c-7 4-12 11-12 18 0 8 5 14 12 14s12-6 12-14c0-7-5-14-12-18z" fill={color} />
      <Path d="M14 24l4 4 8-10" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// 04 — GAVEL: a minimal auction-hammer formed from two strokes; an accent strike-dot.
export function MarkGavel({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path d="M8 34h24" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Rect x={11} y={10} width={18} height={10} rx={2} rotation={-22} originX={20} originY={15} fill={color} />
      <Path d="M28 8l4 4" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={13} cy={29} r={2.4} fill={accent} />
    </Svg>
  );
}

// 05 — CONCENTRIC: nested arcs radiating from a settlement point.
export function MarkConcentric({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={22} r={3} fill={accent} />
      <Path d="M11 22a9 9 0 0 1 18 0" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M5 22a15 15 0 0 1 30 0" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

// 06 — WHEAT-TICK: a checkmark made of two wheat-ear strokes.
export function MarkWheatTick({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path d="M6 22l8 8L34 10" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M10 18l2 2M14 22l2 2M18 26l2 2M22 22l2-2M26 18l2-2M30 14l2-2" stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

// 07 — CB MONOGRAM: custom letterforms locked together as a single mark.
export function MarkMonogram({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Path d="M22 8a12 12 0 1 0 0 24" stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" />
      <Path d="M22 8h4c4 0 7 2 7 6s-3 6-7 6h-4M22 20h5c4 0 7 2 7 6s-3 6-7 6h-5" stroke={color} strokeWidth={3.2} strokeLinejoin="round" fill="none" />
      <Circle cx={33} cy={9} r={2} fill={accent} />
    </Svg>
  );
}

// 08 — RISING BARS: three vertical strokes ascending, a bid ladder.
export function MarkBars({ size = 32, color = INK, accent = EMBER }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <Rect x={6} y={22} width={6} height={14} rx={1.5} fill={color} />
      <Rect x={17} y={14} width={6} height={22} rx={1.5} fill={color} />
      <Rect x={28} y={6} width={6} height={30} rx={1.5} fill={color} />
      <Circle cx={31} cy={6} r={3} fill={accent} />
    </Svg>
  );
}

export const MARKS: Record<string, React.ComponentType<MarkProps>> = {
  arc: MarkArc,
  sprout: MarkSprout,
  kernel: MarkKernel,
  gavel: MarkGavel,
  concentric: MarkConcentric,
  wheattick: MarkWheatTick,
  monogram: MarkMonogram,
  bars: MarkBars,
};

// Wordmark — mark + "CropBid" in Geist SemiBold with tight tracking.
export function Wordmark({
  size = 22,
  glyph = 'arc',
  color = INK,
  accent = EMBER,
  gap = 10,
}: {
  size?: number;
  glyph?: keyof typeof MARKS | string;
  color?: string;
  accent?: string;
  gap?: number;
}) {
  const Mark = MARKS[glyph] || MarkSprout;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <Mark size={size * 1.4} color={color} accent={accent} />
      <Text
        style={{
          fontFamily: font.sansSemi,
          fontSize: size,
          letterSpacing: size * -0.028,
          color,
        }}
      >
        CropBid
      </Text>
    </View>
  );
}
