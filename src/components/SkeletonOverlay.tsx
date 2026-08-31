import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

// Keypoints below this confidence are not drawn — prevents random noise dots
export const CONF_THRESHOLD = 0.3;

// Set true for front camera so the overlay's left/right matches the mirrored preview.
// If the skeleton appears left-right inverted relative to your body, toggle this to false.
export const MIRROR_X = true;

export type SkeletonStatus = 'good' | 'adjust' | 'error' | 'guide';

// GREEN = good form, ORANGE = minor deviation, RED = critical error, CYAN = instructional/guide
export const STATUS_COLORS: Record<SkeletonStatus, string> = {
  good: '#00FF88',
  adjust: '#FF8C00',
  error: '#FF3B3B',
  guide: '#00E5FF',
};

// COCO skeleton bone pairs [from_keypoint_index, to_keypoint_index]
const SKELETON_PAIRS: [number, number][] = [
  [5, 6],   // shoulders
  [11, 12], // hips
  [5, 11],  // left torso
  [6, 12],  // right torso
  [5, 7],   // left upper arm
  [7, 9],   // left lower arm
  [6, 8],   // right upper arm
  [8, 10],  // right lower arm
  [11, 13], // left upper leg
  [13, 15], // left lower leg
  [12, 14], // right upper leg
  [14, 16], // right lower leg
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

interface DotProps {
  keypoints: SharedValue<number[]>;
  index: number;
  width: number;
  height: number;
  color: string;
}

// Always mounted; opacity is animated to 0 below the confidence threshold instead of
// unmounting, so dots fade rather than pop, and so useAnimatedProps' hook count stays fixed.
function KeypointDot({ keypoints, index, width, height, color }: DotProps) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const kp = keypoints.value;
    const y = kp[index * 3] ?? 0;
    const x = kp[index * 3 + 1] ?? 0;
    const conf = kp[index * 3 + 2] ?? 0;
    return {
      cx: (MIRROR_X ? 1 - x : x) * width,
      cy: y * height,
      opacity: conf >= CONF_THRESHOLD ? 0.9 : 0,
    };
  });

  return <AnimatedCircle r={6} fill={color} animatedProps={animatedProps} />;
}

interface BoneProps {
  keypoints: SharedValue<number[]>;
  from: number;
  to: number;
  width: number;
  height: number;
  color: string;
}

function BoneLine({ keypoints, from, to, width, height, color }: BoneProps) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const kp = keypoints.value;
    const yA = kp[from * 3] ?? 0;
    const xA = kp[from * 3 + 1] ?? 0;
    const confA = kp[from * 3 + 2] ?? 0;
    const yB = kp[to * 3] ?? 0;
    const xB = kp[to * 3 + 1] ?? 0;
    const confB = kp[to * 3 + 2] ?? 0;
    const visible = confA >= CONF_THRESHOLD && confB >= CONF_THRESHOLD;
    return {
      x1: (MIRROR_X ? 1 - xA : xA) * width,
      y1: yA * height,
      x2: (MIRROR_X ? 1 - xB : xB) * width,
      y2: yB * height,
      opacity: visible ? 0.7 : 0,
    };
  });

  return <AnimatedLine stroke={color} strokeWidth={2.5} animatedProps={animatedProps} />;
}

interface Props {
  /** Shared value of 51 numbers: [y0, x0, c0, y1, x1, c1, ...], each normalized 0..1 */
  keypoints: SharedValue<number[]>;
  width: number;
  height: number;
  status: SkeletonStatus;
}

// Memoized — WorkoutScreen re-renders on every active-phase frame (setSquatState/
// setPushupState/etc., which the rep counter/feedback text genuinely need every frame), but
// that shouldn't force this ~30-element SVG tree to re-reconcile too: `keypoints` is a stable
// SharedValue reference (its VALUE updates on the UI thread via reanimated, not through
// re-renders), and width/height/status only actually change occasionally. Without memo, every
// frame's re-render still cost real JS-thread time here, delaying how soon the thread was
// free for the NEXT frame's keypoint bridge call — same congestion mechanism documented in
// WorkoutScreen.tsx's updateKeypoints, just from a different (load-bearing, non-throttleable)
// state update.
function SkeletonOverlay({ keypoints, width, height, status }: Props) {
  const color = STATUS_COLORS[status];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        {SKELETON_PAIRS.map(([a, b]) => (
          <BoneLine
            key={`bone-${a}-${b}`}
            keypoints={keypoints}
            from={a}
            to={b}
            width={width}
            height={height}
            color={color}
          />
        ))}
        {Array.from({ length: 17 }, (_, i) => (
          <KeypointDot
            key={`dot-${i}`}
            keypoints={keypoints}
            index={i}
            width={width}
            height={height}
            color={color}
          />
        ))}
      </Svg>
    </View>
  );
}

export default React.memo(SkeletonOverlay);
