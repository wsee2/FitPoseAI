import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius, Shadows } from '../../theme';

interface GradientCardProps {
  children: React.ReactNode;
  colors?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  onPress?: () => void;
  glowColor?: string;
  noBorder?: boolean;
  padding?: number;
}

export const GradientCard: React.FC<GradientCardProps> = ({
  children,
  colors = ['#1E1E1E', '#141414'] as [string, string],
  style,
  onPress,
  glowColor,
  noBorder = false,
  padding = 20,
}) => {
  const glowStyle = glowColor ? {
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  } : Shadows.card;

  const content = (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient, !noBorder && styles.border, { padding }, style]}
    >
      {children}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.wrapper, glowStyle]}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.wrapper, glowStyle]}>
      {content}
    </View>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  noPadding?: boolean;
}> = ({ children, style, onPress, noPadding }) => {
  const inner = (
    <View style={[styles.card, !noPadding && styles.cardPadding, style]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={Shadows.subtle}>
        {inner}
      </TouchableOpacity>
    );
  }

  return <View style={Shadows.subtle}>{inner}</View>;
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: BorderRadius.card,
  },
  border: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPadding: {
    padding: 20,
  },
});
