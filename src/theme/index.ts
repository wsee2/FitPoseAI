export const Colors = {
  background: '#0A0A0A',
  backgroundSecondary: '#111111',
  card: '#1A1A1A',
  cardElevated: '#222222',
  cardHighlight: '#1E1E1E',
  border: '#2A2A2A',
  borderLight: '#333333',

  cyan: '#00E5FF',
  cyanDark: '#00B8CC',
  cyanDim: 'rgba(0,229,255,0.12)',
  cyanGlow: 'rgba(0,229,255,0.25)',
  cyanBright: 'rgba(0,229,255,0.9)',

  orange: '#FF8A00',
  orangeDark: '#CC6E00',
  orangeDim: 'rgba(255,138,0,0.12)',
  orangeGlow: 'rgba(255,138,0,0.25)',

  gold: '#FFB800',
  goldDim: 'rgba(255,184,0,0.12)',

  success: '#00D26A',
  successDim: 'rgba(0,210,106,0.12)',
  warning: '#FFB800',
  warningDim: 'rgba(255,184,0,0.12)',
  error: '#FF4D4F',
  errorDim: 'rgba(255,77,79,0.12)',

  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  textInverse: '#0A0A0A',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export const Typography = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.5, color: Colors.textPrimary },
  h1: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1, color: Colors.textPrimary },
  h2: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.5, color: Colors.textPrimary },
  h3: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3, color: Colors.textPrimary },
  h4: { fontSize: 17, fontWeight: '600' as const, color: Colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24, color: Colors.textSecondary },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24, color: Colors.textPrimary },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20, color: Colors.textSecondary },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.3, color: Colors.textMuted },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 2, textTransform: 'uppercase' as const, color: Colors.textMuted },
  numericLarge: { fontSize: 56, fontWeight: '800' as const, letterSpacing: -2, color: Colors.textPrimary },
  numericMedium: { fontSize: 36, fontWeight: '800' as const, letterSpacing: -1, color: Colors.textPrimary },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  card: 20,
  full: 9999,
};

export const Shadows = {
  cyan: {
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  orange: {
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
};

export const GradientPresets = {
  cyanBlue: ['#00E5FF', '#0066FF'] as const,
  orangeRed: ['#FF8A00', '#FF4D4F'] as const,
  greenCyan: ['#00D26A', '#00E5FF'] as const,
  goldOrange: ['#FFB800', '#FF8A00'] as const,
  darkCard: ['#1E1E1E', '#141414'] as const,
  darkSurface: ['#161616', '#0E0E0E'] as const,
  cyanGlow: ['rgba(0,229,255,0.2)', 'rgba(0,229,255,0)'] as const,
  orangeGlow: ['rgba(255,138,0,0.2)', 'rgba(255,138,0,0)'] as const,
};
