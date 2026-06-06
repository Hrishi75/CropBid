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

// Design-system extras for the buyer-agent iOS screens (mobile.html).
// Translucent lines + dark-marketplace surfaces that don't map cleanly to the
// opaque tokens above.
export const design = {
  bg: colors.surfaceAlt, //   --bg     #f4f1ea
  paper: colors.surface, //   --paper  #fbf9f3
  paper2: colors.surfaceHover, // --paper-2 #efece3
  ink: colors.text,
  ink2: colors.textSecondary,
  ink3: colors.textMuted,
  line: 'rgba(20,20,15,0.09)', //   --line
  lineLight: 'rgba(20,20,15,0.05)', // --line-2
  // accent greens used on dark surfaces
  leaf: '#9bc97a',
  mint: '#e6efd9',
  // dark marketplace
  forestDeep: '#161f10',
  forestCard: '#1f2b16',
} as const;

// Font family keys — must match the names loaded via expo-google-fonts in App.tsx.
export const font = {
  sans: 'Geist_400Regular',
  sansMed: 'Geist_500Medium',
  sansSemi: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMed: 'GeistMono_500Medium',
  monoSemi: 'GeistMono_600SemiBold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
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
