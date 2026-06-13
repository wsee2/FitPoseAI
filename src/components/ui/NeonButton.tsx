import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, BorderRadius } from '../../theme';

interface NeonButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANTS = {
  primary: {
    gradient: ['#00E5FF', '#0066FF'] as const,
    glow: Colors.cyan,
    textColor: '#000000',
  },
  secondary: {
    gradient: ['#FF8A00', '#FF4D4F'] as const,
    glow: Colors.orange,
    textColor: '#FFFFFF',
  },
  ghost: {
    gradient: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.03)'] as const,
    glow: 'transparent',
    textColor: Colors.textPrimary,
  },
  danger: {
    gradient: ['#FF4D4F', '#CC0000'] as const,
    glow: Colors.error,
    textColor: '#FFFFFF',
  },
};

const SIZES = {
  sm: { height: 40, fontSize: 14, paddingH: 16 },
  md: { height: 52, fontSize: 16, paddingH: 24 },
  lg: { height: 60, fontSize: 18, paddingH: 32 },
};

export const NeonButton: React.FC<NeonButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  style,
  textStyle,
  disabled = false,
  loading = false,
  icon,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const v = VARIANTS[variant];
  const s = SIZES[size];

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 300, friction: 20 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 20 }).start();
  };

  const glowStyle = v.glow !== 'transparent' ? {
    shadowColor: v.glow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: disabled ? 0 : 0.4,
    shadowRadius: 16,
    elevation: disabled ? 0 : 8,
  } : {};

  return (
    <Animated.View style={[{ transform: [{ scale }] }, glowStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        <LinearGradient
          colors={v.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.base,
            {
              height: s.height,
              paddingHorizontal: s.paddingH,
              borderRadius: BorderRadius.full,
              opacity: disabled ? 0.4 : 1,
            },
            variant === 'ghost' && styles.ghostBorder,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={v.textColor} />
          ) : (
            <>
              {icon}
              <Text style={[
                styles.label,
                { fontSize: s.fontSize, color: v.textColor },
                icon ? styles.labelWithIcon : null,
                textStyle,
              ]}>
                {title}
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelWithIcon: {
    marginLeft: 8,
  },
});
