// =============================================================================
// Theme — mirrors the web palette (client/src/index.css @theme block)
// =============================================================================
// Plain constants instead of NativeWind so the MVP has zero extra build config.
// Keep these in sync with the web tokens if the brand palette changes.

export const colors = {
  forest: '#1f2d18',
  forest2: '#2d3b22',
  sage: '#6b8e4e',
  sage2: '#8ba869',
  wheat: '#c9b27a',
  ember: '#c8602b',
  ember2: '#e07a3f',

  surface: '#fbf9f3',
  surfaceAlt: '#f4f1ea',
  surfaceHover: '#efece3',

  text: '#14140f',
  textSecondary: '#4a4a3f',
  textMuted: '#82806f',
  textInverse: '#f4f1ea',

  success: '#6b8e4e',
  warning: '#c9b27a',
  error: '#c8602b',
  info: '#4a6580',

  border: '#d8d4c8',
  borderLight: '#e8e4d6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Map bid/listing status → status colour
export const statusColor: Record<string, string> = {
  PENDING: colors.warning,
  ACCEPTED: colors.success,
  REJECTED: colors.error,
  COUNTERED: colors.info,
  EXPIRED: colors.textMuted,
  ACTIVE: colors.success,
  IN_AUCTION: colors.info,
  SOLD: colors.textMuted,
};
