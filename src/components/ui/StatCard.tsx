import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, BorderRadius } from '../../theme';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  trend?: { value: string; positive: boolean };
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  icon,
  accentColor = Colors.cyan,
  trend,
  style,
  size = 'md',
}) => {
  const isSmall = size === 'sm';

  return (
    <View style={[styles.card, isSmall && styles.cardSmall, style]}>
      <LinearGradient
        colors={['#1E1E1E', '#161616']}
        style={[styles.gradient, isSmall && styles.gradientSmall]}
      >
        {/* Accent dot */}
        <View style={[styles.accentDot, { backgroundColor: accentColor }]} />

        {icon && <View style={styles.iconContainer}>{icon}</View>}

        <View style={styles.valueRow}>
          <Text style={[
            isSmall ? Typography.h3 : Typography.h2,
            styles.value,
            { color: accentColor },
          ]}>
            {value}
          </Text>
          {unit && (
            <Text style={[Typography.caption, styles.unit]}>{unit}</Text>
          )}
        </View>

        <Text style={[Typography.caption, styles.label]}>{label}</Text>

        {trend && (
          <View style={styles.trendRow}>
            <Text style={[styles.trendArrow, { color: trend.positive ? Colors.success : Colors.error }]}>
              {trend.positive ? '↑' : '↓'}
            </Text>
            <Text style={[Typography.caption, { color: trend.positive ? Colors.success : Colors.error }]}>
              {trend.value}
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
};

interface QuickStatProps {
  label: string;
  value: string | number;
  color: string;
}

export const QuickStat: React.FC<QuickStatProps> = ({ label, value, color }) => (
  <View style={qStyles.container}>
    <Text style={[Typography.h3, { color }]}>{value}</Text>
    <Text style={[Typography.caption, qStyles.label]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cardSmall: {
    borderRadius: BorderRadius.lg,
  },
  gradient: {
    padding: 20,
    minWidth: 120,
  },
  gradientSmall: {
    padding: 14,
    minWidth: 90,
  },
  accentDot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 3,
    height: '100%',
    borderTopLeftRadius: BorderRadius.xl,
    borderBottomLeftRadius: BorderRadius.xl,
  },
  iconContainer: {
    marginBottom: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    letterSpacing: -0.5,
  },
  unit: {
    marginLeft: 4,
    marginBottom: 4,
    color: Colors.textMuted,
  },
  label: {
    marginTop: 4,
    color: Colors.textSecondary,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 2,
  },
  trendArrow: {
    fontSize: 12,
    fontWeight: '700',
  },
});

const qStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    marginTop: 2,
    color: Colors.textMuted,
  },
});
