import React, { Component, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect as SvgRect } from 'react-native-svg';
import Rive, { Alignment, Fit, RiveRef, RNRiveErrorType } from 'rive-react-native';
import type { RNRiveError } from 'rive-react-native';
import { Colors } from '../theme';

const STATE_MACHINE = 'State Machine 1';
const INPUT_NAME = 'Expressions';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COACH_ASSET = require('../../assets/coach.riv') as number;

// ── CIRCULAR CROP TUNING ──────────────────────────────────────────────────────
// The artboard is square. The robot face/head sits in the top-left region;
// the demo button column is on the right side of the artboard.
//
// AVATAR_INNER_SCALE — inner Rive view size = size × AVATAR_INNER_SCALE (square).
//   1 / AVATAR_INNER_SCALE = fraction of artboard visible per axis before the
//   circular clip is applied.
//   1.9 → ~53 % of artboard visible per axis; buttons at ~65 %+ stay out of circle.
//   ↑ Increase (e.g. 2.1) if demo buttons still bleed in from the right.
//   ↓ Decrease (e.g. 1.6) if the robot face is too small inside the circle.
const AVATAR_INNER_SCALE = 1.53;
//
// AVATAR_X_FRAC — horizontal shift as a fraction of `size`.
//   Applied as: left = -(size × AVATAR_X_FRAC).
//   Negative left moves the inner view LEFT of the container origin, which
//   scrolls the artboard RIGHTWARD to centre the robot face in the circle.
//   ↑ Increase (e.g. 0.25) to shift the robot further right in the circle.
//   ↓ Decrease toward 0 to shift it left (shows more empty margin on left).
const AVATAR_X_FRAC = 0.18;
//
// AVATAR_Y_FRAC — vertical shift as a fraction of `size`.
//   Applied as: top = -(size × AVATAR_Y_FRAC).
//   Negative top moves the inner view ABOVE the container origin, scrolling
//   the artboard DOWNWARD inside the circle (revealing more of the lower body).
//   Keep at 0 if the robot head is already visible near the top of the artboard.
//   ↑ Increase (e.g. 0.15) if the head is cut off at the bottom of the circle.
//   ↓ Decrease toward 0 if there is too much empty space at the top.
const AVATAR_Y_FRAC = 0.18;
// ─────────────────────────────────────────────────────────────────────────────

// Error boundary — catches render-time throws from rive-react-native.
class RiveBoundary extends Component<
  { children: React.ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

// Static SVG fallback — identical to the existing CoachAvatar used in AICoachScreen.
function StaticRobotFallback({ size }: { size: number }) {
  return (
    <LinearGradient
      colors={['#001A33', '#000D1A']}
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <Svg width={size * 0.65} height={size * 0.65} viewBox="0 0 52 52" fill="none">
        <SvgRect x="10" y="12" width="32" height="26" rx="6" stroke={Colors.cyan} strokeWidth="2" fill="rgba(0,229,255,0.08)" />
        <Circle cx="20" cy="23" r="4" fill={Colors.cyan} />
        <Circle cx="32" cy="23" r="4" fill={Colors.cyan} />
        <Circle cx="20" cy="23" r="2" fill={Colors.textPrimary} />
        <Circle cx="32" cy="23" r="2" fill={Colors.textPrimary} />
        <Path d="M18 32 Q26 37 34 32" stroke={Colors.cyan} strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <Path d="M26 12 L26 6" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" />
        <Circle cx="26" cy="5" r="2.5" fill={Colors.cyan} />
        <SvgRect x="6" y="20" width="4" height="10" rx="2" fill={Colors.cyan} fillOpacity="0.6" />
        <SvgRect x="42" y="20" width="4" height="10" rx="2" fill={Colors.cyan} fillOpacity="0.6" />
      </Svg>
    </LinearGradient>
  );
}

// Expression values: 1=Smiling, 2=Happy, 3=Sad, 4=Scared, 5=Surprised
interface Props {
  size: number;
  expression: number;
}

export default function CoachAvatarCircle({ size, expression }: Props) {
  const riveRef = useRef<RiveRef>(null);
  const lastExprRef = useRef<number>(-1);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (hasError || expression === lastExprRef.current) return;
    lastExprRef.current = expression;
    try {
      riveRef.current?.setInputState(STATE_MACHINE, INPUT_NAME, expression);
    } catch {
      // state machine not yet ready; syncs on next expression change
    }
  }, [expression, hasError]);

  const innerSize = size * AVATAR_INNER_SCALE;
  const innerLeft = -(size * AVATAR_X_FRAC);
  const innerTop  = -(size * AVATAR_Y_FRAC);

  return (
    /*
     * Two-layer circle:
     *
     * 1. Outer ring  — the cyan glow border + elevation.  No overflow:'hidden'
     *    here because on Android, elevation and overflow:'hidden' on the same
     *    view suppress the shadow.
     *
     * 2. Inner clip  — overflow:'hidden' + borderRadius = size/2 cuts the
     *    oversized Rive view to a circle.  The border of the outer view draws
     *    on top of the inner clip's edge, so the ring is always visible.
     */
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: Colors.cyanGlow,
        shadowColor: Colors.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: size / 2,
          overflow: 'hidden',
        }}
      >
        {hasError ? (
          <StaticRobotFallback size={size} />
        ) : (
          <RiveBoundary onFail={() => setHasError(true)}>
            <Rive
              ref={riveRef}
              source={COACH_ASSET}
              stateMachineName={STATE_MACHINE}
              autoplay
              fit={Fit.Cover}
              alignment={Alignment.CenterLeft}
              style={{
                position: 'absolute',
                width: innerSize,
                height: innerSize,
                left: innerLeft,
                top: innerTop,
                backgroundColor: 'transparent',
              }}
              onError={(e: RNRiveError) => {
                // Expected on every mount: the avatar is driven by the state machine input,
                // not a ViewModel, so "no default ViewModel found" is harmless. Same handling
                // as CoachRobot.tsx.
                if (e.type === RNRiveErrorType.DataBindingError) return;
                // Only fall back to static SVG when the file itself is unreadable.
                // Other errors (wrong state machine name, unused assets, bad inputs)
                // are non-fatal — the animation still plays; just log them.
                const fatal =
                  e.type === RNRiveErrorType.FileNotFound ||
                  e.type === RNRiveErrorType.MalformedFile ||
                  e.type === RNRiveErrorType.IncorrectRiveFileUrl ||
                  e.type === RNRiveErrorType.UnsupportedRuntimeVersion;
                console.warn('[CoachAvatarCircle]', e.type, e.message,
                  fatal ? '→ showing fallback' : '→ continuing (non-fatal)');
                if (fatal) setHasError(true);
              }}
            />
          </RiveBoundary>
        )}
      </View>
    </View>
  );
}
