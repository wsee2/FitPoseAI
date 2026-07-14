import React, { Component, useEffect, useRef, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Rive, { Alignment, Fit, RiveRef, RNRiveErrorType } from 'rive-react-native';
import type { RNRiveError } from 'rive-react-native';

const STATE_MACHINE = 'State Machine 1';
const INPUT_NAME = 'Expressions';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const COACH_ASSET = require('../../assets/coach.riv') as number;

// ── CROP TUNING ──────────────────────────────────────────────────────────────
// The artboard is square. The robot occupies roughly the left 60% wide × 85%
// tall of the artboard. The demo button column sits on the right side.
// We crop by making the inner Rive view larger than the outer container in the
// horizontal direction (to hide buttons) and taller than it is wide in the
// vertical direction (to reveal more of the robot's body).
//
// HEIGHT_FACTOR — container height = size × HEIGHT_FACTOR.
//   Increase if the robot's body/feet are still cut off at the bottom.
//   Decrease if the container is too tall for the screen layout.
const HEIGHT_FACTOR = 1.55;
//
// CROP_SCALE — inner Rive square size = size × CROP_SCALE.
//   At CROP_SCALE 1.7 the container sees the leftmost (1/1.7 ≈ 59%) of the
//   artboard horizontally, keeping the button column out of view.
//   Increase if buttons still peek in from the right.
//   Decrease if the robot appears too small (but buttons may reappear).
const CROP_SCALE = 1.7;
//
// CROP_INNER_LEFT — px: left edge of inner view relative to container.
//   0  = artboard starts at the container's left edge (default, robot on left).
//   <0 = crops the left margin, shifting the robot right — use a small negative
//        value (e.g. -10) if there is empty purple space to the left of the robot.
//   >0 = empty gap before artboard (not useful).
const CROP_INNER_LEFT = 0;
//
// CROP_INNER_TOP — px: top edge of inner view relative to container.
//   0  = artboard starts at container top (default).
//   <0 = inner view starts above container → container sees artboard from lower down.
//        Use if the robot's shadow/feet are STILL cut (e.g. -10, -20).
//   >0 = adds empty space above artboard → use if the robot's head is cut at top.
const CROP_INNER_TOP = 0;
// ─────────────────────────────────────────────────────────────────────────────

class RiveBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Expression values: 1=Smiling, 2=Happy, 3=Sad, 4=Scared, 5=Surprised
interface Props {
  expression: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export default function CoachRobot({ expression, size = 120, style }: Props) {
  const riveRef = useRef<RiveRef>(null);
  const lastExprRef = useRef<number>(-1);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (hasError || expression === lastExprRef.current) return;
    lastExprRef.current = expression;
    try {
      riveRef.current?.setInputState(STATE_MACHINE, INPUT_NAME, expression);
    } catch {
      // state machine not yet initialised — will sync on next expression change
    }
  }, [expression, hasError]);

  if (hasError) return null;

  const innerSize = size * CROP_SCALE;

  return (
    <RiveBoundary>
      {/*
        Outer container = visible avatar area (width × taller height).
        HEIGHT_FACTOR > 1 reveals more of the robot's body without
        affecting the horizontal crop that hides the button column.
        overflow:'hidden' clips the oversized inner view on all sides.
        borderRadius rounds the purple artboard card to look intentional.
      */}
      <View
        pointerEvents="none"
        style={[
          {
            width: size,
            height: size * HEIGHT_FACTOR,
            overflow: 'hidden',
            borderRadius: size * 0.18,
          },
          style,
        ]}
      >
        {/*
          Inner Rive: innerSize × innerSize (square, larger than container).
          Positioned at (CROP_INNER_LEFT, CROP_INNER_TOP) so the robot
          (left/top region of artboard) stays inside the container while the
          button column (right region) overflows and is clipped.
          Fit.Cover + Alignment.CenterLeft: artboard fills inner square,
          left-anchored so the robot side is never pushed out by fit alignment.
        */}
        <Rive
          ref={riveRef}
          source={COACH_ASSET}
          stateMachineName={STATE_MACHINE}
          autoplay
          fit={Fit.Cover}
          alignment={Alignment.CenterLeft}
          style={{
            width: innerSize,
            height: innerSize,
            position: 'absolute',
            left: CROP_INNER_LEFT,
            top: CROP_INNER_TOP,
            backgroundColor: 'transparent',
          }}
          onError={(e: RNRiveError) => {
            if (e.type === RNRiveErrorType.DataBindingError) return;
            console.warn('[CoachRobot]', e.type, e.message);
            setHasError(true);
          }}
        />
      </View>
    </RiveBoundary>
  );
}
