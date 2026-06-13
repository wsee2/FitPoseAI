import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Line, Ellipse, Rect } from 'react-native-svg';
import { ExerciseId } from '../../data/exercises';

interface ExerciseIconProps {
  exerciseId: ExerciseId;
  size?: number;
  color?: string;
}

export const ExerciseIcon: React.FC<ExerciseIconProps> = ({
  exerciseId,
  size = 48,
  color = '#FFFFFF',
}) => {
  const s = size;
  const c = color;

  const icons: Record<ExerciseId, React.ReactNode> = {
    squat: (
      <Svg width={s} height={s} viewBox="0 0 48 48">
        {/* Head */}
        <Circle cx="24" cy="7" r="5" stroke={c} strokeWidth="2.5" fill="none" />
        {/* Body */}
        <Path d="M24 12 L24 22" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Squat position - arms out, knees bent */}
        <Path d="M14 18 L24 22 L34 18" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M24 22 L18 34 L14 40" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M24 22 L30 34 L34 40" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    ),
    pushup: (
      <Svg width={s} height={s} viewBox="0 0 48 48">
        {/* Head */}
        <Circle cx="8" cy="20" r="4.5" stroke={c} strokeWidth="2.5" fill="none" />
        {/* Body parallel to ground */}
        <Path d="M12 22 L36 26" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Arms pushing */}
        <Path d="M20 24 L20 34" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        <Path d="M30 25 L30 35" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Legs */}
        <Path d="M36 26 L42 32" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Ground line */}
        <Line x1="6" y1="36" x2="44" y2="36" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      </Svg>
    ),
    lunge: (
      <Svg width={s} height={s} viewBox="0 0 48 48">
        {/* Head */}
        <Circle cx="22" cy="6" r="5" stroke={c} strokeWidth="2.5" fill="none" />
        {/* Torso */}
        <Path d="M22 11 L22 24" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Arms */}
        <Path d="M14 18 L22 22 L30 18" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Front leg (bent) */}
        <Path d="M22 24 L30 34 L30 42" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Back leg (knee down) */}
        <Path d="M22 24 L14 32 L18 42" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    ),
    plank: (
      <Svg width={s} height={s} viewBox="0 0 48 48">
        {/* Head */}
        <Circle cx="7" cy="22" r="4.5" stroke={c} strokeWidth="2.5" fill="none" />
        {/* Straight body */}
        <Path d="M11 24 L40 24" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Forearms down */}
        <Path d="M18 24 L16 32" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        <Path d="M27 24 L25 32" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Feet */}
        <Path d="M40 24 L44 28" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Ground */}
        <Line x1="6" y1="34" x2="44" y2="34" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      </Svg>
    ),
    situp: (
      <Svg width={s} height={s} viewBox="0 0 48 48">
        {/* Sitting up position */}
        {/* Head */}
        <Circle cx="30" cy="12" r="5" stroke={c} strokeWidth="2.5" fill="none" />
        {/* Torso (angled up) */}
        <Path d="M26 16 L18 28" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        {/* Arms behind head */}
        <Path d="M32 14 L36 20 L30 18" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Hip + legs flat */}
        <Path d="M18 28 L12 32 L8 32" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M18 28 L24 36 L38 36" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Ground */}
        <Line x1="4" y1="38" x2="44" y2="38" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      </Svg>
    ),
  };

  return <View style={{ width: s, height: s }}>{icons[exerciseId]}</View>;
};
