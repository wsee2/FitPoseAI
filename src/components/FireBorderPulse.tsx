import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  interpolateColor,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

// Fire hue sweep — red-orange -> orange -> yellow-orange -> back to red-orange (first === last
// so the loop has no visible seam). Shared by all three glow layers so they read as one flame,
// not three independently-coloured rings.
const FIRE_COLORS = ['#FF3C00', '#FF7A00', '#FFC400', '#FF3C00'] as const;
const HUE_CYCLE_MS = 900;
// Two asymmetric legs (rather than a single symmetric pulse) so the intensity reads as an
// irregular flicker instead of a smooth, mechanical breathing pulse.
const FLICKER_UP_MS = 180;
const FLICKER_DOWN_MS = 240;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 350;

type Props = {
  /** Whether the pulse should be visible/animating right now. Duration is owned by the caller —
   *  this component just fades in on true and fades out on false. */
  active: boolean;
};

/**
 * Full-screen glowing border that pulses through warm fire tones. Three stacked absoluteFill
 * Views (increasing borderWidth, decreasing opacity) fake a soft outer glow without native
 * shadow/blur APIs — Android View shadows (elevation) don't support colour tinting, so a layered
 * translucent-border trick is used instead. All animation runs on the UI thread via reanimated,
 * decoupled from both the JS thread and VisionCamera's separate frame-processor worklet thread.
 */
export default function FireBorderPulse({ active }: Props) {
  const intensity = useSharedValue(0);
  const flicker = useSharedValue(0);
  const hue = useSharedValue(0);

  useEffect(() => {
    if (active) {
      intensity.value = withTiming(1, { duration: FADE_IN_MS, easing: Easing.out(Easing.quad) });
      flicker.value = withRepeat(
        withSequence(
          withTiming(1, { duration: FLICKER_UP_MS, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.55, { duration: FLICKER_DOWN_MS, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
      hue.value = withRepeat(withTiming(1, { duration: HUE_CYCLE_MS, easing: Easing.linear }), -1, false);
    } else {
      intensity.value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.quad) });
      cancelAnimation(flicker);
      cancelAnimation(hue);
    }
  }, [active, intensity, flicker, hue]);

  const coreStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * (0.75 + flicker.value * 0.25),
    borderColor: interpolateColor(hue.value, [0, 0.33, 0.66, 1], FIRE_COLORS as unknown as string[]),
  }));
  const midStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * (0.3 + flicker.value * 0.18),
    borderColor: interpolateColor(hue.value, [0, 0.33, 0.66, 1], FIRE_COLORS as unknown as string[]),
  }));
  const outerStyle = useAnimatedStyle(() => ({
    opacity: intensity.value * (0.12 + flicker.value * 0.1),
    borderColor: interpolateColor(hue.value, [0, 0.33, 0.66, 1], FIRE_COLORS as unknown as string[]),
  }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.ring, styles.outer, outerStyle]} />
      <Animated.View pointerEvents="none" style={[styles.ring, styles.mid, midStyle]} />
      <Animated.View pointerEvents="none" style={[styles.ring, styles.core, coreStyle]} />
    </>
  );
}

const styles = StyleSheet.create({
  ring: { ...StyleSheet.absoluteFillObject },
  outer: { borderWidth: 46 },
  mid: { borderWidth: 22 },
  core: { borderWidth: 7 },
});
