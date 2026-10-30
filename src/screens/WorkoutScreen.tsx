import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NitroModules } from 'react-native-nitro-modules';
import { useRunOnJS, useSharedValue } from 'react-native-worklets-core';
import {
  Easing,
  useSharedValue as useReanimatedValue,
  withTiming,
} from 'react-native-reanimated';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import type { TensorflowModel } from 'react-native-fast-tflite';
import type { HomeStackParamList } from '../navigation/types';
import { getDefaultTabBarStyle } from '../navigation/tabBarStyle';
import { loadMoveNetModel } from '../services/moveNet';
import { useApp } from '../context/AppContext';
import { getSessionEndMessage } from '../services/aiCoach';
import { EXERCISES, formatDuration, type WorkoutSession } from '../data/exercises';
import { todayMYTDateStr } from '../utils/mytDate';

import { speakFeedback, speakImmediate, reset as ttsReset } from '../services/ttsService';
import { pulseRep } from '../services/hapticsService';
import { EncouragementEngine } from '../services/encouragementService';
import { getDefaultTarget, DEFAULT_SETS } from '../utils/workoutTarget';
import { DEBUG_LOGS, PERF_HUD_ENABLED, DEBUG_LOG_INTERVAL_MS } from '../utils/debugFlags';
import { INITIAL_SQUAT_STATE, SquatFsm, type SquatFsmState } from '../services/fsm/squatFsm';
import { INITIAL_PUSHUP_STATE, PushupFsm, type PushupFsmState } from '../services/fsm/pushupFsm';
import { INITIAL_LUNGE_STATE, LungeFsm, type LungeFsmState } from '../services/fsm/lungeFsm';
import { INITIAL_PLANK_STATE, PlankFsm, type PlankFsmState } from '../services/fsm/plankFsm';
import { INITIAL_SITUP_STATE, SitupFsm, type SitupFsmState } from '../services/fsm/situpFsm';
import SkeletonOverlay, { CONF_THRESHOLD, STATUS_COLORS, type SkeletonStatus } from '../components/SkeletonOverlay';
import CoachAvatarCircle from '../components/CoachAvatarCircle';
import WorkoutChatOverlay from '../components/WorkoutChatOverlay';
import FireBorderPulse from '../components/FireBorderPulse';

/** Pulls the exercise-specific (reps, score) pair out of whichever FSM is active. */
function getFinalStats(
  exerciseId: HomeStackParamList['Workout']['exerciseId'],
  squatState: SquatFsmState,
  pushupState: PushupFsmState,
  lungeState: LungeFsmState,
  plankState: PlankFsmState,
  situpState: SitupFsmState
): { reps: number; score: number } {
  switch (exerciseId) {
    case 'squat':
      return { reps: squatState.counter, score: squatState.score };
    case 'pushup':
      return { reps: pushupState.counter, score: pushupState.score };
    case 'lunge':
      return { reps: lungeState.counter, score: lungeState.score };
    case 'plank':
      return { reps: plankState.holdSeconds, score: plankState.holdSeconds };
    case 'situp':
      return { reps: situpState.counter, score: situpState.score };
    default:
      return { reps: 0, score: 0 };
  }
}

const INFER_EVERY_N_FRAMES = 1;
// Duration of the linear ease from the last displayed keypoints to the newly detected ones
// (skeleton overlay only — FSMs consume raw, unsmoothed keypoints, see updateKeypoints below).
// New detections land every ~38-50ms at the device's typical 20-26 FPS. If this value is close
// to or larger than that interval, each tween gets re-targeted before finishing, so the overlay
// perpetually trails the real position. Keep it comfortably below the inter-frame interval.
// Raise it (e.g. toward 30-40) if the skeleton looks jittery; lower it (e.g. toward 8-12) if it
// still looks laggy. Lowered 16→10→8 per that guidance (confirmed laggy on-device, then
// confirmed improved but still wanted faster) — 8 is the bottom of the documented safe range,
// below which jitter risk starts outweighing the lag reduction. Note this only shortens the
// display's catch-up tween once a new detection arrives; it can't remove the underlying
// ~30-40ms inference latency itself (see PERF HUD/[PERF] logs) — see updateKeypoints's
// setKeypoints/setInferenceMs/setResizeMs throttling and SkeletonOverlay's React.memo for the
// other (JS-thread-congestion) half of this investigation.
const SMOOTHING_MS = 8;

// Motion prediction — extrapolates each keypoint forward by this many ms, using its velocity
// since the previous frame, before handing it to the SMOOTHING_MS tween. Compensates for the
// inference+resize+bridge time that's already elapsed by the time a detection reaches the
// screen (now ~15-25ms with the GPU delegate — see moveNet.ts), so the display shows a
// predicted "now" position instead of an already-slightly-stale one. Display-only: never
// touches fsmKp, so rep counting is completely unaffected. Set to 0 to disable entirely and
// fall back to exactly the pre-prediction behavior (raw detection, no extrapolation).
// UNTESTED — expect to retune on-device: raise it for more lag compensation (more overshoot
// risk on sudden direction changes), lower it toward 0 if the skeleton looks jittery/wobbly.
const PREDICTION_LOOKAHEAD_MS = 12;
// Caps how far any single keypoint can be extrapolated per frame (normalized 0-1 units, so
// 0.04 = 4% of frame width/height) — guards against ordinary frame-to-frame keypoint jitter
// (which looks like a large "velocity" over a very short time delta) being amplified into a
// visible overshoot/snap.
const PREDICTION_MAX_DISPLACEMENT = 0.04;
// If less time than this has passed since the previous frame, skip prediction for this frame
// (falls back to the raw detection) rather than dividing by a too-small delta and turning tiny
// position noise into a huge apparent velocity.
const PREDICTION_MIN_DELTA_MS = 8;

const ROBOT_DEBOUNCE_MS = 800;
const ROBOT_HAPPY_DURATION_MS = 1500;
// Longer than the normal per-rep flash so reaching the workout target reads as a distinct
// celebration rather than blending into the same brief happy-flash every other rep gets.
const ROBOT_TARGET_CELEBRATION_MS = 2500;
const ROBOT_MIN_TRACKED_KPS = 8;
// Fixed delay between "target reached" (non-final set) and the auto-transition into the
// 'setComplete' rest screen. Deliberately a fixed timer, not "wait for confirmed spoken" —
// the latter risks never firing if the user reps fast enough that the encouragement message
// never wins ttsService's rate-limit race, which would strand them in a set that already ended.
const SET_COMPLETE_TRANSITION_DELAY_MS = 2500;

// ── WORKOUT SCREEN ROBOT LAYOUT ──────────────────────────────────────────────
// WORKOUT_ROBOT_SIZE — circular avatar diameter in dp.
//   Increase for a bigger coach presence; decrease if it covers the preview.
const WORKOUT_ROBOT_SIZE  = 90;
// WORKOUT_ROBOT_RIGHT — dp from the right edge of the screen.
//   Keep close to the Finish button (right: 20) so they align visually.
const WORKOUT_ROBOT_RIGHT = 12;
// WORKOUT_ROBOT_TOP_OFFSET — dp below the top safe-area inset.
//   The Finish button occupies insets.top+12 … insets.top+~56.
//   This value places the avatar just below it with a small gap.
const WORKOUT_ROBOT_TOP_OFFSET = 64;
// ────────────────────────────────────────────────────────────────────────────

function getCounterRotationDeg(orientation: Frame['orientation']): number {
  'worklet';
  switch (orientation) {
    case 'landscape-left':       return 270;
    case 'portrait-upside-down': return 180;
    case 'landscape-right':      return 90;
    default:                     return 0;
  }
}

function degreesToResizeRotation(deg: number): '0deg' | '90deg' | '180deg' | '270deg' {
  'worklet';
  switch (deg) {
    case 90:  return '90deg';
    case 180: return '180deg';
    case 270: return '270deg';
    default:  return '0deg';
  }
}

const DEBUG = DEBUG_LOGS;

// ---------------------------------------------------------------------------
// Overlay display transform (for skeleton alignment, confirmed working values).
type OverlayTransform = 'flip_both' | '90' | '270' | '90_mirror' | '270_mirror';

const LANDSCAPE_LEFT_TRANSFORM: OverlayTransform = '90';
const LANDSCAPE_RIGHT_TRANSFORM: OverlayTransform = '270';

// FSM-input normalization: realigns +y = gravity in all device orientations.
const FSM_LANDSCAPE_LEFT_TRANSFORM: OverlayTransform = 'flip_both';
const FSM_LANDSCAPE_RIGHT_TRANSFORM: OverlayTransform = 'flip_both';

function applyOverlayTransform(kp: number[], t: OverlayTransform): number[] {
  const d = kp.slice();
  for (let i = 0; i < 17; i++) {
    const ky = kp[i * 3]!;
    const kx = kp[i * 3 + 1]!;
    switch (t) {
      case 'flip_both':  d[i*3]=1-ky; d[i*3+1]=1-kx; break;
      case '90':         d[i*3]=1-kx; d[i*3+1]=ky;   break;
      case '270':        d[i*3]=kx;   d[i*3+1]=1-ky; break;
      case '90_mirror':  d[i*3]=1-kx; d[i*3+1]=1-ky; break;
      case '270_mirror': d[i*3]=kx;   d[i*3+1]=ky;   break;
    }
  }
  return d;
}
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// STAGE 1 — undo resize()'s automatic center-crop-to-square (DISPLAY ONLY).
// The resize() call below passes `scale: {width:192,height:192}` with no explicit `crop`.
// Per vision-camera-resize-plugin's own docs (and its native ResizePlugin.kt source, verified
// directly): "If [crop is] not set, a center-crop to the given target aspect ratio is
// automatically calculated" — here, a 1:1 SQUARE, computed by trimming the frame's LARGER
// dimension down to match its smaller one, centered. So MoveNet's raw normalized (x,y) are
// relative to a square, center-cropped sub-region of the upright frame — NOT the full frame.
// This recovers each keypoint's true position as a fraction of the FULL upright frame
// (rotatedFrameW x rotatedFrameH), which the STAGE 2 cover-crop correction below depends on.
// Angle math (the FSMs, via fsmKp) deliberately does NOT use this — see the note below.
function undoModelSquareCrop(kp: number[], rotatedFrameW: number, rotatedFrameH: number): number[] {
  if (!(rotatedFrameW > 0) || !(rotatedFrameH > 0)) return kp; // dimensions not ready yet
  const side = Math.min(rotatedFrameW, rotatedFrameH);
  const cropXFrac = (rotatedFrameW - side) / 2 / rotatedFrameW; // 0 unless frame is wider than tall
  const cropYFrac = (rotatedFrameH - side) / 2 / rotatedFrameH; // 0 unless frame is taller than wide
  const scaleXFrac = side / rotatedFrameW;
  const scaleYFrac = side / rotatedFrameH;
  const d = kp.slice();
  for (let i = 0; i < 17; i++) {
    d[i * 3] = cropYFrac + kp[i * 3]! * scaleYFrac;
    d[i * 3 + 1] = cropXFrac + kp[i * 3 + 1]! * scaleXFrac;
  }
  return d;
}

// STAGE 2 — "cover" crop correction (DISPLAY ONLY — feeds SkeletonOverlay via displayKp).
// <Camera> never sets `resizeMode`, so it uses VisionCamera's default "cover", which crops
// the (full, STAGE-1-recovered) frame to fill the screen whenever their aspect ratios differ.
// Without this the skeleton is drawn as if the entire frame were visible edge-to-edge —
// producing a systematic offset/scale mismatch against the actually-visible (cropped)
// preview. Must run on STAGE 1's output (fraction of the FULL frame), and after the existing
// landscape rotation transform above, since that transform swaps which axis is "width" vs
// "height" for displayKp — contentAspect is computed to match.
function applyCoverCropCorrection(kp: number[], contentAspect: number, screenAspect: number): number[] {
  if (!(contentAspect > 0) || !(screenAspect > 0)) return kp; // dimensions not ready yet
  const d = kp.slice();
  if (contentAspect > screenAspect) {
    // Content proportionally wider than the screen -> left/right edges are cropped off.
    const visibleFrac = screenAspect / contentAspect;
    const xMin = (1 - visibleFrac) / 2;
    for (let i = 0; i < 17; i++) {
      d[i * 3 + 1] = (kp[i * 3 + 1]! - xMin) / visibleFrac;
    }
  } else if (contentAspect < screenAspect) {
    // Content proportionally taller/narrower than the screen -> top/bottom are cropped off.
    const visibleFrac = contentAspect / screenAspect;
    const yMin = (1 - visibleFrac) / 2;
    for (let i = 0; i < 17; i++) {
      d[i * 3] = (kp[i * 3]! - yMin) / visibleFrac;
    }
  }
  return d;
}

// Motion prediction (DISPLAY ONLY — see PREDICTION_LOOKAHEAD_MS above for the full rationale).
// Extrapolates each keypoint's y/x forward using its velocity since `previous`, clamped and
// confidence-gated to avoid amplifying ordinary frame-to-frame jitter into visible overshoot.
// Runs on `displayKp`, never on `fsmKp` — rep counting always sees the raw, unpredicted
// detection, completely unaffected by this.
function predictKeypoints(current: number[], previous: number[] | null, deltaMs: number): number[] {
  if (PREDICTION_LOOKAHEAD_MS <= 0 || previous === null || deltaMs < PREDICTION_MIN_DELTA_MS) {
    return current;
  }
  const predicted = current.slice();
  for (let i = 0; i < 17; i++) {
    const conf = current[i * 3 + 2] ?? 0;
    if (conf < CONF_THRESHOLD) continue; // unreliable point — don't extrapolate, show as-is
    for (let axis = 0; axis < 2; axis++) { // 0 = y, 1 = x
      const idx = i * 3 + axis;
      const curVal = current[idx] ?? 0;
      const prevVal = previous[idx] ?? curVal;
      const velocityPerMs = (curVal - prevVal) / deltaMs;
      const displacement = Math.max(
        -PREDICTION_MAX_DISPLACEMENT,
        Math.min(PREDICTION_MAX_DISPLACEMENT, velocityPerMs * PREDICTION_LOOKAHEAD_MS)
      );
      predicted[idx] = curVal + displacement;
    }
  }
  return predicted;
}

// NOTE on FSM angle math (fsmKp, below): deliberately NOT run through either stage above.
// resize()'s square crop is crop-then-UNIFORM-scale (same scale factor S on both axes, just
// offset differently per axis — confirmed against the native source), not an independent
// per-axis stretch. A uniform scale plus a per-axis offset does not change the ratio between
// any two points' dx and dy, so raw model-output angles (via calculateAngle/spineLeanAngle in
// poseMath.ts) are ALREADY geometrically correct with no correction needed. (An earlier
// version of this code incorrectly assumed a non-uniform stretch and "corrected" fsmKp for
// it — that was based on a wrong premise and has been removed; it was quietly introducing
// distortion into rep-counting that wasn't there before.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Calibration phase
type WorkoutPhase = 'calibrating' | 'countdown' | 'active' | 'setComplete';

// Keypoints that must ALL be visible before the workout starts.
// Ankles (15, 16) intentionally excluded — they're the least reliable and often
// clip at the bottom edge, causing unnecessary calibration failures.
const CALIB_REQUIRED_KPS = [0, 5, 6, 11, 12, 13, 14]; // nose, shoulders, hips, knees
// Lower confidence threshold for calibration — pose detection is noisier at distance.
const CALIB_CONF_THRESHOLD = 0.2;
// Margin from edge: keypoints within [MARGIN, 1-MARGIN] are considered "in frame".
const CALIB_FRAME_MARGIN = 0.04;
// Consecutive valid frames required before triggering the countdown (reduced from 8).
const CALIB_STABLE_FRAMES = 5;
// Consecutive bad frames needed to reset the stable counter — absorbs momentary noise.
const CALIB_BAD_TOLERANCE = 5;
// For upright exercises: kneeY - shoulderY must exceed this.
const CALIB_UPRIGHT_SPREAD = 0.28;
// For horizontal exercises: abs(shoulderY - kneeY) must be below this.
const CALIB_HORIZONTAL_SPREAD = 0.2;
// Exercises that require a horizontal body posture.
const HORIZONTAL_EXERCISES = new Set(['pushup', 'plank']);

// ── LIGHTING DETECTION (confidence as lighting proxy) ─────────────────────────
// Number of recent calibration frames kept in the rolling confidence window.
// Larger = more stable signal, slower response; 20 frames ≈ 0.7 s at ~30 fps.
const LIGHTING_SAMPLE_FRAMES  = 20;
// Mean keypoint confidence below this (while a person is present) indicates poor
// lighting. Well-lit scenes typically average > 0.45; dim ones drop below 0.3.
const LIGHTING_LOW_CONF       = 0.35;
// Consecutive frames the rolling avg must stay below LIGHTING_LOW_CONF before the
// hint is shown. Combined latency ≈ (LIGHTING_SAMPLE_FRAMES + LIGHTING_SUSTAIN_FRAMES).
const LIGHTING_SUSTAIN_FRAMES = 15;
// Minimum confidence for any single keypoint in {nose, L-shoulder, R-shoulder} to
// count as "person present". Prevents firing the hint on a completely empty frame.
const LIGHTING_PERSON_FLOOR   = 0.10;
// ─────────────────────────────────────────────────────────────────────────────

// ── PERFORMANCE HUD ───────────────────────────────────────────────────────────
// PERF_HUD_ENABLED now lives in utils/debugFlags.ts, alongside DEBUG_LOGS — flip both there
// before a demo/presentation for a clean console + screen. [PERF] console logs are also
// suppressed when false.
// Ring-buffer depth for rolling averages (FPS, latencies).
// 30 samples ≈ 1 s at 30 fps — large enough to be stable, small enough to react.
const PERF_AVG_WINDOW      = 30;
// How often (ms) a [PERF] summary is printed to the Metro console for copy-paste
// into FYP Chapter 4 tables.
const PERF_LOG_INTERVAL_MS = 5_000;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns { valid, guidance } based on fsmKp (world-upright normalized keypoints).
 * Called on every frame during 'calibrating' and 'countdown' phases.
 */
function checkCalibration(fsmKp: number[], exerciseId: string): { valid: boolean; guidance: string } {
  // 1. All required keypoints above calibration confidence threshold.
  const allDetected = CALIB_REQUIRED_KPS.every((i) => (fsmKp[i * 3 + 2] ?? 0) >= CALIB_CONF_THRESHOLD);
  if (!allDetected) {
    return { valid: false, guidance: 'Step into the frame' };
  }

  // 2. All required keypoints within frame margins (not clipped at edges).
  const allInFrame = CALIB_REQUIRED_KPS.every((i) => {
    const y = fsmKp[i * 3] ?? 0;
    const x = fsmKp[i * 3 + 1] ?? 0;
    return (
      y >= CALIB_FRAME_MARGIN && y <= 1 - CALIB_FRAME_MARGIN &&
      x >= CALIB_FRAME_MARGIN && x <= 1 - CALIB_FRAME_MARGIN
    );
  });
  if (!allInFrame) {
    return { valid: false, guidance: 'Move back — full body must be visible' };
  }

  // 3. Exercise-specific posture check using knees (more reliable than ankles).
  const shoulderY = ((fsmKp[5 * 3] ?? 0) + (fsmKp[6 * 3] ?? 0)) / 2;
  const kneeY     = ((fsmKp[13 * 3] ?? 0) + (fsmKp[14 * 3] ?? 0)) / 2;

  if (HORIZONTAL_EXERCISES.has(exerciseId)) {
    if (Math.abs(shoulderY - kneeY) >= CALIB_HORIZONTAL_SPREAD) {
      return { valid: false, guidance: 'Get into position — body horizontal' };
    }
  } else {
    if (kneeY - shoulderY <= CALIB_UPRIGHT_SPREAD) {
      return { valid: false, guidance: 'Stand upright facing the camera' };
    }
  }

  return { valid: true, guidance: 'Hold still...' };
}
// ---------------------------------------------------------------------------

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

export default function WorkoutScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const { width: previewWidth, height: previewHeight } = useWindowDimensions();
  const isLandscape = previewWidth > previewHeight;
  // Mirrors previewWidth/previewHeight every render so the stable updateKeypoints closure
  // (see useRunOnJS below, deps=[exerciseId] only) can read the current screen size for the
  // Part A cover-crop correction without going stale after a device rotation — same pattern
  // as phaseRef below.
  const previewWidthRef = useRef(previewWidth);
  const previewHeightRef = useRef(previewHeight);
  previewWidthRef.current = previewWidth;
  previewHeightRef.current = previewHeight;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  // Hide the bottom tab bar for the entire time this screen is focused. It's `position:
  // absolute` with Android `elevation` (AppNavigator.tsx), which — unlike the in-tree
  // overlays here (SkeletonOverlay, WorkoutChatOverlay) — isn't ordered by this screen's own
  // zIndex, so it can render on top of them. Previously this went unnoticed because
  // WorkoutChatOverlay used a native <Modal>, which always draws above the tab bar
  // regardless; now that it's an in-tree view, the tab bar must be hidden explicitly.
  // Restoring with `undefined` does NOT fall back to AppNavigator's function-based
  // screenOptions default — it falls back to the library's bare default (white background) —
  // so the exact style must be reconstructed via the shared getDefaultTabBarStyle helper.
  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({ tabBarStyle: { display: 'none' } });
      return () => parent?.setOptions({ tabBarStyle: getDefaultTabBarStyle(insets.bottom) });
    }, [navigation, insets.bottom])
  );

  const { hasPermission, requestPermission } = useCameraPermission();
  const { addWorkoutSession, workoutHistory, setLastCoachMessage, profile } = useApp();
  // route.params.target/sets cover WorkoutSetupScreen's steppers; the fallback covers any
  // path that skips that screen entirely (e.g. a future deep link straight into Workout).
  const target = route.params.target ?? getDefaultTarget(exerciseId, profile?.level ?? 'beginner');
  const totalSets = route.params.sets ?? DEFAULT_SETS;
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const liveDevice = frontDevice ?? backDevice;
  // Cache the last known-good device. useCameraDevice can momentarily report undefined
  // during a transient hardware hiccup (e.g. the camera service restarting after a
  // "session/recoverable-error") even though the device itself never actually went away.
  // Without this, that single blip would unmount <Camera> and strand the user on the
  // "No camera device found" screen — short-circuiting VisionCamera's own built-in
  // session recovery, which only works if the component stays mounted.
  const lastGoodDeviceRef = useRef(liveDevice);
  if (liveDevice) lastGoodDeviceRef.current = liveDevice;
  const device = liveDevice ?? lastGoodDeviceRef.current;

  // Constrain BOTH the preview and the frame-processor stream to a format whose aspect ratio
  // is as close to the screen's as possible — VisionCamera's own documented pattern for this
  // (FormatFilter.videoAspectRatio: "target aspect ratio of the video (and preview) output").
  // Without this, VisionCamera can provision the preview and the frame processor's analysis
  // stream at different resolutions/aspect ratios (frame processing commonly targets a lower,
  // performance-oriented resolution independent of preview), so frame.width/frame.height
  // (consumed by the PART A/B corrections below) wouldn't reliably represent what's actually
  // shown on screen — and it also shrinks the crop mismatch PART A has to correct for.
  // Also request the highest FPS this device/format combo supports (VisionCamera's filters
  // are "closest match" scoring, not hard requirements, so asking for 60 safely degrades to
  // whatever the matching format's real ceiling is). Without an explicit fps request here,
  // the format filtered on aspect ratio alone could land on a lower-FPS mode than the
  // hardware actually supports — capping camera frame delivery below what the (now
  // GPU-accelerated, faster) inference pipeline could otherwise keep up with, which would
  // show up as skeleton lag no amount of inference/JS-thread tuning could fix, since fresh
  // frames simply wouldn't be arriving any faster.
  const format = useCameraFormat(device, [
    { videoAspectRatio: previewHeight / previewWidth },
    { fps: 60 },
  ]);
  // Clamp to the SELECTED format's actual max — requesting a Camera fps outside the chosen
  // format's [minFps, maxFps] range is invalid, so this can never exceed real hardware limits.
  const targetFps = format ? Math.min(60, format.maxFps) : undefined;
  const loggedFormatRef = useRef(false);
  if (format && !loggedFormatRef.current) {
    loggedFormatRef.current = true;
    console.log(
      `[CAMERA] selected format: ${format.videoWidth}x${format.videoHeight} ` +
      `fpsRange=${format.minFps}-${format.maxFps} requestedFps=${targetFps}`
    );
  }

  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [keypoints, setKeypoints] = useState<number[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [resizeMs, setResizeMs] = useState<number | null>(null);
  const frameCount = useSharedValue(0);
  const deviceOrientationDeg = useSharedValue(isLandscape ? 90 : 0);
  const animatedKeypoints = useReanimatedValue<number[]>(new Array(51).fill(0));
  // Previous frame's RAW (unpredicted) displayKp + its timestamp — velocity reference for
  // predictKeypoints. Deliberately stores the raw detection, not the extrapolated result, so
  // prediction error can't compound frame-over-frame.
  const prevDisplayKpRef = useRef<number[] | null>(null);
  const prevDisplayTsRef = useRef(0);

  // FSM instances
  const squatFsmRef = useRef(new SquatFsm());
  const [squatState, setSquatState] = useState<SquatFsmState>(INITIAL_SQUAT_STATE);
  const pushupFsmRef = useRef(new PushupFsm());
  const [pushupState, setPushupState] = useState<PushupFsmState>(INITIAL_PUSHUP_STATE);
  const lungeFsmRef = useRef(new LungeFsm());
  const [lungeState, setLungeState] = useState<LungeFsmState>(INITIAL_LUNGE_STATE);
  const plankFsmRef = useRef(new PlankFsm());
  const [plankState, setPlankState] = useState<PlankFsmState>(INITIAL_PLANK_STATE);
  const situpFsmRef = useRef(new SitupFsm());
  const [situpState, setSitupState] = useState<SitupFsmState>(INITIAL_SITUP_STATE);
  const encouragementRef = useRef(new EncouragementEngine());

  // Coach robot expression
  const [coachExpression, setCoachExpression] = useState(1);
  const coachExpressionRef = useRef(1);
  const expressionLockedUntilRef = useRef(0);
  const prevRepCountRef = useRef(0);
  const prevPlankHoldingRef = useRef(false);
  const plankTargetCelebratedRef = useRef(false);

  // Fire border pulse — purely visual, additive to the existing target-reached celebration.
  // Triggered at the exact same instant as ROBOT_TARGET_CELEBRATION_MS (fires on every set,
  // final or not), with its own independent 2500ms on-window so it never touches
  // setTransitionScheduledRef/setCompleteTimerRef (the actual set-complete phase transition).
  const [firePulseActive, setFirePulseActive] = useState(false);
  const firePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Multi-set bookkeeping.
  // currentSet is 1-indexed and only ever advances via handleNextSet (tapped from the
  // 'setComplete' rest screen) — never auto-advances on a timer by itself.
  const [currentSet, setCurrentSet] = useState(1);
  // Finalized {reps, score} for each set completed BEFORE the current one — the current set's
  // live stats come from finalStatsRef (below) and are appended at save time, not here.
  const completedSetsRef = useRef<{ reps: number; score: number }[]>([]);
  // Guards the target-reached -> setComplete auto-transition so it only ever schedules once
  // per set, even though the driving effect below re-runs on every FSM update.
  const setTransitionScheduledRef = useRef(false);
  const setCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session bookkeeping
  const sessionStartRef = useRef(Date.now());
  const hasSavedRef = useRef(false);

  // Tap-to-chat overlay — pauses the camera/inference/FSM pipeline while open.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const isChatOpenRef = useRef(false);
  isChatOpenRef.current = isChatOpen;

  // ---------------------------------------------------------------------------
  // Calibration phase state.
  // phaseRef is kept in sync with phase state on every render so that the stable
  // updateKeypoints closure can always read the latest phase without needing to be
  // in the useRunOnJS dependency array.
  const [phase, setPhase] = useState<WorkoutPhase>('calibrating');
  const phaseRef = useRef<WorkoutPhase>('calibrating');
  phaseRef.current = phase;

  const [calibGuidance, setCalibGuidance] = useState('Step into the frame');
  const calibGuidanceRef = useRef('Step into the frame'); // guards against duplicate setState calls

  const [countdownNum, setCountdownNum] = useState(3);
  const [showLightingHint, setShowLightingHint] = useState(false);
  const [perfHud, setPerfHud] = useState({ camFps: 0, inferFps: 0, inferMs: 0, resizeMs: 0, totalMs: 0 });
  const stableFramesRef = useRef(0);
  const badFramesRef = useRef(0); // consecutive invalid frames; resets stable counter only after CALIB_BAD_TOLERANCE
  // Lighting hint refs — all used inside the updateKeypoints closure via stable ref identity.
  const lightingConfBufferRef   = useRef<number[]>([]);
  const lightingSustainCountRef = useRef(0);
  const lightingHintSpokenRef   = useRef(false);
  const showLightingHintRef     = useRef(false); // mirrors showLightingHint for stale-closure safety
  // Perf HUD ring buffers — updated on JS thread in updateKeypoints.
  const perfInferTsRef   = useRef<number[]>([]);  // inference call timestamps
  const perfCamFcRef     = useRef<number[]>([]);  // total frame count at each inference
  const perfInferMsRef   = useRef<number[]>([]);  // per-inference runSync latency (ms)
  const perfResizeMsRef  = useRef<number[]>([]);  // per-inference resize latency (ms)
  const lastPerfUpdateRef = useRef(0);             // last timestamp we called setPerfHud
  const lastPerfLogRef    = useRef(0);             // last timestamp we logged [PERF]
  // Throttles setKeypoints/setInferenceMs/setResizeMs and the [POSE] log — these ran on
  // every processed frame (16-28x/sec), each triggering a full WorkoutScreen re-render plus
  // a string-building console.log, which congested the JS thread enough to delay how soon it
  // was free to handle the NEXT frame's keypoints. Neither the skeleton (reads the reanimated
  // shared value, not this state) nor any FSM's counting (reads fsmKp fresh every call) uses
  // this state, so throttling it only affects the debug badge/HUD and how often the coach
  // avatar's "tracking lost" check (trackedCount) refreshes — see DEBUG_LOG_INTERVAL_MS.
  const lastDebugUpdateRef = useRef(0);
  // TEMP — diagnosing the skeleton-alignment aspect-ratio math. Remove once confirmed fixed.
  const lastAlignLogRef   = useRef(0);             // last timestamp we logged [ALIGN]
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scale animation for the countdown digit.
  const countdownScale = useRef(new Animated.Value(1)).current;

  // Status border — pulsing opacity during calibration, solid otherwise.
  const borderPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (phase === 'calibrating') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(borderPulse, { toValue: 0.2, duration: 900, useNativeDriver: true }),
          Animated.timing(borderPulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
    Animated.timing(borderPulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [phase]);

  // Clear lighting hint when the workout goes active — it's calibration-only.
  useEffect(() => {
    if (phase === 'active') {
      showLightingHintRef.current = false;
      setShowLightingHint(false);
      lightingConfBufferRef.current = [];
      lightingSustainCountRef.current = 0;
    }
  }, [phase]);
  // ---------------------------------------------------------------------------

  // Reset the active exercise's FSM (and calibration state) whenever the screen is entered.
  useEffect(() => {
    // Reset calibration phase
    phaseRef.current = 'calibrating';
    setPhase('calibrating');
    stableFramesRef.current = 0;
    calibGuidanceRef.current = 'Step into the frame';
    setCalibGuidance('Step into the frame');

    // Clear any lingering countdown timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    stableFramesRef.current = 0;
    badFramesRef.current = 0;

    // Reset lighting hint state
    lightingConfBufferRef.current = [];
    lightingSustainCountRef.current = 0;
    lightingHintSpokenRef.current = false;
    showLightingHintRef.current = false;
    setShowLightingHint(false);

    // Reset perf HUD ring buffers
    perfInferTsRef.current  = [];
    perfCamFcRef.current    = [];
    perfInferMsRef.current  = [];
    perfResizeMsRef.current = [];
    lastPerfUpdateRef.current = 0;
    lastPerfLogRef.current    = 0;
    lastDebugUpdateRef.current = 0;
    prevDisplayKpRef.current = null;
    prevDisplayTsRef.current = 0;

    // Reset FSMs
    switch (exerciseId) {
      case 'squat':
        squatFsmRef.current.reset();
        setSquatState(INITIAL_SQUAT_STATE);
        break;
      case 'pushup':
        pushupFsmRef.current.reset();
        setPushupState(INITIAL_PUSHUP_STATE);
        break;
      case 'lunge':
        lungeFsmRef.current.reset();
        setLungeState(INITIAL_LUNGE_STATE);
        break;
      case 'plank':
        plankFsmRef.current.reset();
        setPlankState(INITIAL_PLANK_STATE);
        break;
      case 'situp':
        situpFsmRef.current.reset();
        setSitupState(INITIAL_SITUP_STATE);
        break;
    }
    // currentSet is always 1 at this point — this effect only fires on mount (deps below
    // never change after the initial navigation into this screen). The guard mirrors the
    // countdown-completion effect's for consistency/defensiveness, not because it's reachable
    // here with currentSet > 1.
    if (currentSet === 1) sessionStartRef.current = Date.now();
    hasSavedRef.current = false;
    ttsReset();
    encouragementRef.current.reset(target);
    plankTargetCelebratedRef.current = false;
    prevRepCountRef.current = 0;
    prevPlankHoldingRef.current = false;
    setFirePulseActive(false);
    if (firePulseTimerRef.current) {
      clearTimeout(firePulseTimerRef.current);
      firePulseTimerRef.current = null;
    }

    // Fresh screen entry — clear any multi-set progress from a previous exercise/session.
    completedSetsRef.current = [];
    setTransitionScheduledRef.current = false;
    if (setCompleteTimerRef.current) {
      clearTimeout(setCompleteTimerRef.current);
      setCompleteTimerRef.current = null;
    }
  }, [exerciseId, target]);

  // Countdown timer: fires when phase transitions to 'countdown'.
  useEffect(() => {
    if (phase !== 'countdown') return;

    setCountdownNum(3);
    Animated.sequence([
      Animated.timing(countdownScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.timing(countdownScale, { toValue: 1,   duration: 300, useNativeDriver: true }),
    ]).start();
    speakImmediate('Three');

    let count = 3;
    const timer = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(timer);
        countdownTimerRef.current = null;

        speakImmediate('Go!');

        // Reset FSM cleanly before the first counted rep.
        switch (exerciseId) {
          case 'squat':  squatFsmRef.current.reset();  setSquatState(INITIAL_SQUAT_STATE);   break;
          case 'pushup': pushupFsmRef.current.reset(); setPushupState(INITIAL_PUSHUP_STATE); break;
          case 'lunge':  lungeFsmRef.current.reset();  setLungeState(INITIAL_LUNGE_STATE);   break;
          case 'plank':  plankFsmRef.current.reset();  setPlankState(INITIAL_PLANK_STATE);   break;
          case 'situp':  situpFsmRef.current.reset();  setSitupState(INITIAL_SITUP_STATE);   break;
        }
        // Session timer starts NOW (not at screen mount, not during calibration) — but only
        // for set 1. Later sets reuse this same countdown flow (via handleNextSet), and must
        // NOT push sessionStartRef forward, or the saved duration would only cover the final
        // set instead of the whole multi-set session.
        if (currentSet === 1) sessionStartRef.current = Date.now();
        hasSavedRef.current = false;
        ttsReset();
        encouragementRef.current.reset(target);
        plankTargetCelebratedRef.current = false;
        setTransitionScheduledRef.current = false;
        if (setCompleteTimerRef.current) {
          clearTimeout(setCompleteTimerRef.current);
          setCompleteTimerRef.current = null;
        }
        // Without these, a set-2+ FSM reset (counter back to 0 / isHolding back to false)
        // would look like "no progress" against these refs' stale end-of-previous-set values
        // (e.g. prevRepCountRef left at the old target) — silently suppressing the
        // rep-completion happy-flash/haptic and plank's hold-start pulse for every later set.
        prevRepCountRef.current = 0;
        prevPlankHoldingRef.current = false;
        setFirePulseActive(false);
        if (firePulseTimerRef.current) {
          clearTimeout(firePulseTimerRef.current);
          firePulseTimerRef.current = null;
        }

        phaseRef.current = 'active';
        setPhase('active');
      } else {
        setCountdownNum(count);
        Animated.sequence([
          Animated.timing(countdownScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
          Animated.timing(countdownScale, { toValue: 1,   duration: 300, useNativeDriver: true }),
        ]).start();
        speakImmediate(count === 2 ? 'Two' : 'One');
      }
    }, 1000);

    countdownTimerRef.current = timer;
    return () => {
      clearInterval(timer);
      countdownTimerRef.current = null;
    };
  }, [phase, exerciseId, target, currentSet]);

  const finalStatsRef = useRef({ reps: 0, score: 0 });
  finalStatsRef.current = getFinalStats(
    exerciseId, squatState, pushupState, lungeState, plankState, situpState
  );

  const persistSession = useCallback((): WorkoutSession | undefined => {
    if (hasSavedRef.current) return undefined;
    // One WorkoutSession per whole multi-set workout — completed prior sets plus whatever the
    // current (possibly still in-progress, if Finish was tapped mid-set) set has racked up.
    // Reps summed, score averaged; Analytics/experience-level-upgrade code counts sessions by
    // record, so folding sets into one record (rather than one record per set) keeps that math
    // correct — see workoutTarget/experienceLevel.
    const allSets = [...completedSetsRef.current, finalStatsRef.current];
    const reps = allSets.reduce((sum, s) => sum + s.reps, 0);
    const score = Math.round(allSets.reduce((sum, s) => sum + s.score, 0) / allSets.length);
    if (reps <= 0 && score <= 0) return undefined;
    hasSavedRef.current = true;

    const exercise = EXERCISES[exerciseId];
    const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
    const session: WorkoutSession = {
      id: Date.now().toString(),
      exerciseId,
      date: todayMYTDateStr(),
      reps,
      duration,
      score,
      calories: Math.round(reps * exercise.calories),
      formQuality:
        score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Needs Work',
      source: 'live',
      sets: allSets.length,
      targetReps: target,
      targetSets: totalSets,
      // Only written for a genuine multi-set breakdown — never as an explicit `undefined`
      // (Firebase RTDB's push()/set() reject any property valued `undefined`), so the key is
      // conditionally spread in rather than assigned.
      ...(allSets.length > 1 ? { setDetails: allSets.map((s) => s.reps) } : {}),
    };
    addWorkoutSession(session); // also persists to Firebase via AppContext
    // Fire proactive AI coaching message async — non-blocking, stores in context when ready.
    getSessionEndMessage(session, workoutHistory, profile).then(msg => {
      if (msg) setLastCoachMessage(msg);
    }).catch(() => {});
    return session;
  }, [exerciseId, addWorkoutSession, workoutHistory, setLastCoachMessage, profile]);

  const handleFinish = useCallback(() => {
    const session = persistSession();
    if (session) {
      navigation.replace('SessionSummary', { sessionId: session.id });
    } else {
      navigation.goBack();
    }
  }, [persistSession, navigation]);

  const persistSessionRef = useRef(persistSession);
  persistSessionRef.current = persistSession;
  useEffect(() => {
    return () => {
      persistSessionRef.current();
      if (setCompleteTimerRef.current) clearTimeout(setCompleteTimerRef.current);
      if (firePulseTimerRef.current) clearTimeout(firePulseTimerRef.current);
    };
  }, []);

  // Tapped from the 'setComplete' rest screen — advances to the next set and re-enters the
  // existing countdown flow (3-2-1, then a clean FSM reset), never an automatic timer.
  const handleNextSet = useCallback(() => {
    setCurrentSet((s) => s + 1);
    phaseRef.current = 'countdown';
    setPhase('countdown');
  }, []);

  const handleOpenChat = useCallback(() => {
    // Cancel an in-progress pre-workout countdown rather than trying to resume it later —
    // no reps have been counted yet at this point, so dropping back to calibration is lossless.
    if (phaseRef.current === 'countdown') {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      phaseRef.current = 'calibrating';
      setPhase('calibrating');
      stableFramesRef.current = 0;
      badFramesRef.current = 0;
      calibGuidanceRef.current = 'Step into the frame';
      setCalibGuidance('Step into the frame');
    }

    // Finalize/clear each FSM's transient per-frame state (smoothing buffers, in-progress
    // stage, plank's running wall-clock timer) while preserving the accumulated counter/score.
    switch (exerciseId) {
      case 'squat':  squatFsmRef.current.pauseForChat();  break;
      case 'pushup': pushupFsmRef.current.pauseForChat(); break;
      case 'lunge':  lungeFsmRef.current.pauseForChat();  break;
      case 'plank':  plankFsmRef.current.pauseForChat();  break;
      case 'situp':  situpFsmRef.current.pauseForChat();  break;
    }
    encouragementRef.current.pauseForChat();

    setIsChatOpen(true);
  }, [exerciseId]);

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    loadMoveNetModel()
      .then(setModel)
      .catch((err) => console.error('MoveNet load failed:', err));
  }, []);

  const boxedModel = useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model]
  );

  const { resize } = useResizePlugin();

  // Bridge: worklet thread → JS thread.
  // orientationDeg = deviceOrientationDeg.value at frame time (0/90/180/270).
  // Reads phaseRef.current (stable ref object) so this closure never needs re-creation
  // for phase changes — only exerciseId changes recreate it.
  const updateKeypoints = useRunOnJS(
    (kp: number[], inferMs: number, resizeMsArg: number, orientationDeg: number, totalFrames: number, rotatedFrameW: number, rotatedFrameH: number) => {
      // Pipeline paused while the chat overlay is open. Guards the in-flight-frame race where a
      // frame processor call started just before isChatOpen flipped could still land here.
      if (isChatOpenRef.current) return;

      // Throttled — see lastDebugUpdateRef above. shouldUpdateDebug also gates the [POSE]
      // log further down, so both fire together rather than drifting independently.
      const nowForDebug = Date.now();
      const shouldUpdateDebug = nowForDebug - lastDebugUpdateRef.current >= DEBUG_LOG_INTERVAL_MS;
      if (shouldUpdateDebug) {
        lastDebugUpdateRef.current = nowForDebug;
        setKeypoints(kp);
        setInferenceMs(inferMs);
        setResizeMs(resizeMsArg);
      }

      // ── Performance HUD tracking ────────────────────────────────────────────
      // All work here is on the JS thread; ring buffers are plain arrays in refs.
      if (PERF_HUD_ENABLED) {
        const now = Date.now();

        // Push inference timestamp and total camera frame count into ring buffers.
        const push = <T,>(buf: T[], val: T) => {
          buf.push(val);
          if (buf.length > PERF_AVG_WINDOW) buf.shift();
        };
        push(perfInferTsRef.current,  now);
        push(perfCamFcRef.current,    totalFrames);
        push(perfInferMsRef.current,  inferMs);
        push(perfResizeMsRef.current, resizeMsArg);

        // Update display once per second to avoid per-frame re-renders.
        if (now - lastPerfUpdateRef.current >= 1000) {
          lastPerfUpdateRef.current = now;

          const ts = perfInferTsRef.current;
          const fc = perfCamFcRef.current;
          const n  = ts.length;

          // Inference FPS: (n-1) events over the span between first and last timestamp.
          const inferFps = n >= 2
            ? Math.round((n - 1) / ((ts[n - 1]! - ts[0]!) / 1000))
            : 0;

          // Camera FPS: total camera frames delivered over the same span.
          const camFps = n >= 2 && fc.length >= 2
            ? Math.round((fc[n - 1]! - fc[0]!) / ((ts[n - 1]! - ts[0]!) / 1000))
            : 0;

          const avg = (buf: number[]) =>
            buf.length > 0 ? buf.reduce((a, b) => a + b, 0) / buf.length : 0;

          const avgInfer  = avg(perfInferMsRef.current);
          const avgResize = avg(perfResizeMsRef.current);
          const avgTotal  = avgInfer + avgResize;

          setPerfHud({
            camFps,
            inferFps,
            inferMs:  Math.round(avgInfer),
            resizeMs: Math.round(avgResize),
            totalMs:  Math.round(avgTotal),
          });

          // Periodic Metro log — copy these rows into FYP Chapter 4.
          if (now - lastPerfLogRef.current >= PERF_LOG_INTERVAL_MS) {
            lastPerfLogRef.current = now;
            console.log(
              `[PERF] camFPS=${camFps} inferFPS=${inferFps}` +
              ` inferMs=${avgInfer.toFixed(1)}(avg) resizeMs=${avgResize.toFixed(1)}(avg)` +
              ` totalMs=${avgTotal.toFixed(1)}(avg) throttle=every ${INFER_EVERY_N_FRAMES} frames`
            );
          }
        }
      }
      // ───────────────────────────────────────────────────────────────────────

      // STAGE 1 — recover each keypoint's position relative to the FULL upright frame,
      // undoing resize()'s automatic center-crop-to-square (see undoModelSquareCrop above).
      // Display-only: fsmKp (below) deliberately continues from the raw, un-cropped-back kp.
      const kpFullFrame = undoModelSquareCrop(kp, rotatedFrameW, rotatedFrameH);

      // (a) Display copy — overlay transform, portrait = identity.
      let displayKp: number[];
      if (orientationDeg === 90) {
        displayKp = applyOverlayTransform(kpFullFrame, LANDSCAPE_LEFT_TRANSFORM);
      } else if (orientationDeg === 270) {
        displayKp = applyOverlayTransform(kpFullFrame, LANDSCAPE_RIGHT_TRANSFORM);
      } else {
        displayKp = kpFullFrame;
      }

      // (b) Analysis copy — FSM normalization so +y = gravity in every orientation.
      let fsmKp: number[];
      if (orientationDeg === 90) {
        fsmKp = applyOverlayTransform(kp, FSM_LANDSCAPE_LEFT_TRANSFORM);
      } else if (orientationDeg === 270) {
        fsmKp = applyOverlayTransform(kp, FSM_LANDSCAPE_RIGHT_TRANSFORM);
      } else {
        fsmKp = kp;
      }

      // ---------------------------------------------------------------------------
      // STAGE 2 — apply the "cover" crop correction to displayKp (see
      // applyCoverCropCorrection above), on top of STAGE 1's full-frame-relative coordinates.
      // displayKp may have an ADDITIONAL axis swap on top of that, from applyOverlayTransform
      // above (based on orientationDeg, a separate concept — live device rotation only, used
      // to lay the model's native-orientation square onto the current screen's layout).
      const displayAxesSwapped = orientationDeg === 90 || orientationDeg === 270;
      const contentAspectDisplay = displayAxesSwapped ? rotatedFrameH / rotatedFrameW : rotatedFrameW / rotatedFrameH;
      const screenAspect = previewWidthRef.current / previewHeightRef.current;

      // TEMP — diagnosing the skeleton-alignment aspect-ratio math. Remove once confirmed fixed.
      if (Date.now() - lastAlignLogRef.current >= 2000) {
        lastAlignLogRef.current = Date.now();
        const branch = contentAspectDisplay > screenAspect ? 'crop-X' : contentAspectDisplay < screenAspect ? 'crop-Y' : 'none';
        console.log(
          `[ALIGN] rotatedFrame=${rotatedFrameW}x${rotatedFrameH} preview=${previewWidthRef.current}x${previewHeightRef.current}` +
          ` contentAspect=${contentAspectDisplay.toFixed(4)} screenAspect=${screenAspect.toFixed(4)} branch=${branch}` +
          ` orientationDeg=${orientationDeg} displayAxesSwapped=${displayAxesSwapped}`
        );
      }

      displayKp = applyCoverCropCorrection(displayKp, contentAspectDisplay, screenAspect);
      // ---------------------------------------------------------------------------

      // Motion prediction — see predictKeypoints/PREDICTION_LOOKAHEAD_MS above. Velocity is
      // computed against the previous frame's RAW displayKp (stored below, before this frame's
      // prediction), so extrapolation error never compounds across frames.
      const predictDeltaMs = prevDisplayTsRef.current > 0 ? nowForDebug - prevDisplayTsRef.current : 0;
      const predictedDisplayKp = predictKeypoints(displayKp, prevDisplayKpRef.current, predictDeltaMs);
      prevDisplayKpRef.current = displayKp;
      prevDisplayTsRef.current = nowForDebug;

      animatedKeypoints.value = withTiming(predictedDisplayKp, {
        duration: SMOOTHING_MS,
        easing: Easing.linear,
      });

      if (DEBUG && shouldUpdateDebug) {
        const sy  = ((fsmKp[5 * 3] ?? 0) + (fsmKp[6 * 3] ?? 0)) / 2;
        const hy  = ((fsmKp[11 * 3] ?? 0) + (fsmKp[12 * 3] ?? 0)) / 2;
        const ay  = ((fsmKp[15 * 3] ?? 0) + (fsmKp[16 * 3] ?? 0)) / 2;
        const ely = ((fsmKp[7 * 3] ?? 0) + (fsmKp[8 * 3] ?? 0)) / 2;
        const wry = ((fsmKp[9 * 3] ?? 0) + (fsmKp[10 * 3] ?? 0)) / 2;
        const gap = Math.max(ely, wry) - sy;
        console.log(
          `[POSE] ori=${orientationDeg} sy=${sy.toFixed(3)} hy=${hy.toFixed(3)} ay=${ay.toFixed(3)}` +
          ` hDiff=${Math.abs(sy - hy).toFixed(3)} ely=${ely.toFixed(3)} wry=${wry.toFixed(3)} gap=${gap.toFixed(3)}`
        );
      }

      // ---------------------------------------------------------------------------
      // Phase-gated logic: FSMs only run during 'active'.
      const currentPhase = phaseRef.current;

      if (currentPhase === 'calibrating') {
        const { valid, guidance } = checkCalibration(fsmKp, exerciseId);
        if (valid) {
          badFramesRef.current = 0;
          stableFramesRef.current += 1;
          if (stableFramesRef.current >= CALIB_STABLE_FRAMES) {
            // Enough stable frames — kick off countdown.
            stableFramesRef.current = 0;
            badFramesRef.current = 0;
            phaseRef.current = 'countdown';
            setPhase('countdown');
          } else {
            if (calibGuidanceRef.current !== 'Hold still...') {
              calibGuidanceRef.current = 'Hold still...';
              setCalibGuidance('Hold still...');
            }
            speakFeedback('Hold still');
          }
        } else {
          badFramesRef.current += 1;
          // Only wipe stable progress after CALIB_BAD_TOLERANCE consecutive bad frames.
          // A few noisy frames should not reset all accumulated progress.
          if (badFramesRef.current >= CALIB_BAD_TOLERANCE) {
            stableFramesRef.current = 0;
          }
          if (calibGuidanceRef.current !== guidance) {
            calibGuidanceRef.current = guidance;
            setCalibGuidance(guidance);
          }
          speakFeedback(guidance);
        }

        // ── Lighting hint (confidence as lighting proxy) ───────────────────
        // Gate: is any part of the person detectable? Prevents misfiring on
        // empty frames (an empty room has near-zero confidence too).
        const noseConf       = fsmKp[0 * 3 + 2] ?? 0;
        const lShoulderConf  = fsmKp[5 * 3 + 2] ?? 0;
        const rShoulderConf  = fsmKp[6 * 3 + 2] ?? 0;
        const personInFrame  = noseConf       > LIGHTING_PERSON_FLOOR ||
                               lShoulderConf  > LIGHTING_PERSON_FLOOR ||
                               rShoulderConf  > LIGHTING_PERSON_FLOOR;

        if (personInFrame) {
          // Mean confidence of the same keypoints used for calibration.
          const meanConf =
            CALIB_REQUIRED_KPS.reduce((sum, idx) => sum + (fsmKp[idx * 3 + 2] ?? 0), 0) /
            CALIB_REQUIRED_KPS.length;

          const buf = lightingConfBufferRef.current;
          buf.push(meanConf);
          if (buf.length > LIGHTING_SAMPLE_FRAMES) buf.shift();

          if (buf.length >= LIGHTING_SAMPLE_FRAMES) {
            const rollingAvg = buf.reduce((a, b) => a + b, 0) / buf.length;
            if (rollingAvg < LIGHTING_LOW_CONF) {
              lightingSustainCountRef.current += 1;
              if (lightingSustainCountRef.current >= LIGHTING_SUSTAIN_FRAMES &&
                  !showLightingHintRef.current) {
                showLightingHintRef.current = true;
                setShowLightingHint(true);
                if (!lightingHintSpokenRef.current) {
                  lightingHintSpokenRef.current = true;
                  speakImmediate('Lighting looks dim — try turning on more lights');
                }
              }
            } else {
              // Confidence recovered — hide hint and reset sustain counter.
              lightingSustainCountRef.current = 0;
              if (showLightingHintRef.current) {
                showLightingHintRef.current = false;
                setShowLightingHint(false);
              }
            }
          }
        } else {
          // Person absent: reset buffer so empty-frame data doesn't pollute the avg.
          lightingConfBufferRef.current = [];
          lightingSustainCountRef.current = 0;
        }
        // ──────────────────────────────────────────────────────────────────────
        return; // Never call FSMs during calibration.
      }

      if (currentPhase === 'countdown') {
        const { valid } = checkCalibration(fsmKp, exerciseId);
        if (!valid) {
          badFramesRef.current += 1;
          // Only cancel the countdown after sustained loss of valid pose.
          if (badFramesRef.current >= CALIB_BAD_TOLERANCE) {
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            stableFramesRef.current = 0;
            badFramesRef.current = 0;
            const msg = 'Come back into the frame';
            calibGuidanceRef.current = msg;
            setCalibGuidance(msg);
            phaseRef.current = 'calibrating';
            setPhase('calibrating');
            speakFeedback(msg);
          }
        } else {
          badFramesRef.current = 0;
        }
        return; // Never call FSMs during countdown.
      }

      if (currentPhase === 'setComplete') return; // Rest screen — FSMs paused between sets.

      // 'active' — existing FSM logic. fsmKp is the raw, un-cropped-back model output (see
      // the NOTE above applyCoverCropCorrection for why no correction is needed here).
      // Each case: FSM feedback still takes priority — encouragementRef only ever returns a
      // candidate message when form status is 'good'/'guide' (see peekReps/peekHold), so on
      // 'adjust'/'error' encouragement is null and s.feedback (the correction) is spoken
      // exactly as before. speakFeedback's own rate limiter decides whether it actually
      // speaks THIS frame; confirmSpoken() only dequeues the message once it's confirmed
      // spoken, so a message that loses that race stays queued for a later frame instead of
      // being lost.
      switch (exerciseId) {
        case 'squat': {
          const s = squatFsmRef.current.update(fsmKp);
          setSquatState(s);
          const encouragement = encouragementRef.current.peekReps(s.counter, s.status);
          if (speakFeedback(encouragement ?? s.feedback) && encouragement) {
            encouragementRef.current.confirmSpoken();
          }
          break;
        }
        case 'pushup': {
          const s = pushupFsmRef.current.update(fsmKp);
          setPushupState(s);
          const encouragement = encouragementRef.current.peekReps(s.counter, s.status);
          if (speakFeedback(encouragement ?? s.feedback) && encouragement) {
            encouragementRef.current.confirmSpoken();
          }
          break;
        }
        case 'lunge': {
          const s = lungeFsmRef.current.update(fsmKp);
          setLungeState(s);
          const encouragement = encouragementRef.current.peekReps(s.counter, s.status);
          if (speakFeedback(encouragement ?? s.feedback) && encouragement) {
            encouragementRef.current.confirmSpoken();
          }
          break;
        }
        case 'plank': {
          const s = plankFsmRef.current.update(fsmKp);
          setPlankState(s);
          const encouragement = encouragementRef.current.peekHold(s.holdSeconds, s.status);
          if (speakFeedback(encouragement ?? s.feedback) && encouragement) {
            encouragementRef.current.confirmSpoken();
          }
          break;
        }
        case 'situp': {
          const s = situpFsmRef.current.update(fsmKp);
          setSitupState(s);
          const encouragement = encouragementRef.current.peekReps(s.counter, s.status);
          if (speakFeedback(encouragement ?? s.feedback) && encouragement) {
            encouragementRef.current.confirmSpoken();
          }
          break;
        }
      }
      // ---------------------------------------------------------------------------
    },
    [exerciseId]
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';

      frameCount.value += 1;
      if (frameCount.value % INFER_EVERY_N_FRAMES !== 0) return;

      if (boxedModel == null) return;
      const tflite = boxedModel.unbox();

      const baseDeg = getCounterRotationDeg(frame.orientation);
      const totalDeg = (baseDeg + deviceOrientationDeg.value) % 360;
      const rotation = degreesToResizeRotation(totalDeg);
      // True upright content dimensions (MODEL's own kp-native axis convention), accounting
      // for totalDeg — the ACTUAL rotation applied below by resize(). Deliberately NOT based
      // on deviceOrientationDeg.value alone (orientationDeg downstream): the camera sensor is
      // typically mounted 90/270 rotated relative to how the phone is normally held, so
      // baseDeg alone often makes totalDeg 90/270 even in plain portrait with zero live
      // device rotation. Computed here, in the worklet, so there's one source of truth.
      const frameIsRotated = totalDeg === 90 || totalDeg === 270;
      const rotatedFrameW = frameIsRotated ? frame.height : frame.width;
      const rotatedFrameH = frameIsRotated ? frame.width : frame.height;
      const resizeStartedAt = Date.now();
      const resized = resize(frame, {
        scale: { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType: 'uint8',
        rotation,
      });
      const resizeElapsedMs = Date.now() - resizeStartedAt;

      const inputBuffer = resized.buffer.slice(
        resized.byteOffset,
        resized.byteOffset + resized.byteLength
      ) as ArrayBuffer;

      const inferStartedAt = Date.now();
      const outputs = tflite.runSync([inputBuffer]);
      const inferElapsedMs = Date.now() - inferStartedAt;

      const out = new Float32Array(outputs[0]!);
      updateKeypoints(Array.from(out), inferElapsedMs, resizeElapsedMs, deviceOrientationDeg.value, frameCount.value, rotatedFrameW, rotatedFrameH);
    },
    [boxedModel, frameCount, deviceOrientationDeg, resize, updateKeypoints]
  );

  // Skeleton status: force 'guide' (cyan) during calibration/countdown.
  let currentStatus: SkeletonStatus;
  if (phase !== 'active') {
    currentStatus = 'guide';
  } else {
    switch (exerciseId) {
      case 'squat':  currentStatus = squatState.status;  break;
      case 'pushup': currentStatus = pushupState.status; break;
      case 'lunge':  currentStatus = lungeState.status;  break;
      case 'plank':  currentStatus = plankState.status;  break;
      case 'situp':  currentStatus = situpState.status;  break;
      default:       currentStatus = 'guide';
    }
  }

  const statusBorderColor = STATUS_COLORS[currentStatus];

  const trackedCount =
    keypoints.length >= 51
      ? Array.from({ length: 17 }, (_, i) => keypoints[i * 3 + 2]).filter(
          (c) => c >= CONF_THRESHOLD
        ).length
      : 0;

  // Portrait: anchor left so the rep panel doesn't overlap the robot avatar (top-right).
  const repPanelDynamicStyle = isLandscape
    ? { left: 12, top: Math.round(previewHeight * 0.3), alignSelf: 'flex-start' as const }
    : { left: 12, top: insets.top + 50, alignSelf: 'flex-start' as const };

  // Drive coach robot expression from FSM state + tracking quality.
  // Runs after every render where phase/status/trackedCount/counters change.
  useEffect(() => {
    const now = Date.now();

    // Rep just completed → flash Happy, lock for ROBOT_HAPPY_DURATION_MS.
    if (phase === 'active' && exerciseId !== 'plank') {
      const repCount =
        exerciseId === 'squat'  ? squatState.counter  :
        exerciseId === 'pushup' ? pushupState.counter :
        exerciseId === 'lunge'  ? lungeState.counter  :
        situpState.counter;
      if (repCount > prevRepCountRef.current) {
        prevRepCountRef.current = repCount;
        pulseRep();
        coachExpressionRef.current = 2;
        // Target-reaching rep gets a longer, distinct celebration lock; every other rep
        // keeps the normal brief flash. Purely cosmetic — doesn't touch counting/Finish.
        expressionLockedUntilRef.current =
          now + (repCount === target ? ROBOT_TARGET_CELEBRATION_MS : ROBOT_HAPPY_DURATION_MS);
        setCoachExpression(2);

        // Fire border pulse — fires on EVERY target-reached moment, final set included,
        // independent of the non-final-set-only setComplete transition scheduled below.
        if (repCount === target) {
          setFirePulseActive(true);
          if (firePulseTimerRef.current) clearTimeout(firePulseTimerRef.current);
          firePulseTimerRef.current = setTimeout(() => {
            firePulseTimerRef.current = null;
            setFirePulseActive(false);
          }, ROBOT_TARGET_CELEBRATION_MS);
        }

        // Non-final set reaching its target: schedule the rest-screen transition after a
        // fixed delay (see SET_COMPLETE_TRANSITION_DELAY_MS). The FSM keeps running until the
        // timer fires, so a fast user may rack up a couple extra reps in that window — that's
        // fine, same non-blocking philosophy as the single-set target celebration.
        if (repCount === target && currentSet < totalSets && !setTransitionScheduledRef.current) {
          setTransitionScheduledRef.current = true;
          const justCompletedSet = currentSet;
          setCompleteTimerRef.current = setTimeout(() => {
            setCompleteTimerRef.current = null;
            completedSetsRef.current = [...completedSetsRef.current, finalStatsRef.current];
            speakImmediate(`Set ${justCompletedSet} done!`);
            phaseRef.current = 'setComplete';
            setPhase('setComplete');
          }, SET_COMPLETE_TRANSITION_DELAY_MS);
        }
        return;
      }
      prevRepCountRef.current = repCount;
    }

    if (now < expressionLockedUntilRef.current) return;

    const desired =
      phase !== 'active'                   ? 1 :  // Smiling — idle / calibrating
      trackedCount < ROBOT_MIN_TRACKED_KPS ? 5 :  // Surprised — tracking lost
      currentStatus === 'good'             ? 2 :  // Happy
      currentStatus === 'error'            ? 4 :  // Scared
      currentStatus === 'adjust'           ? 3 :  // Sad
                                             1;   // Smiling — guide

    if (desired !== coachExpressionRef.current) {
      coachExpressionRef.current = desired;
      expressionLockedUntilRef.current = now + ROBOT_DEBOUNCE_MS;
      setCoachExpression(desired);
    }
  }, [phase, currentStatus, trackedCount, exerciseId, target, currentSet, totalSets,
      squatState.counter, pushupState.counter, lungeState.counter, situpState.counter]);

  // Plank has no discrete reps to hang the rep-completion haptic on (see the effect above,
  // which explicitly excludes it) — pulse instead each time a hold actually starts/resumes,
  // a separate, minimal effect so this doesn't entangle with the expression-driving one above.
  // Also fires plank's own once-per-session target-reached celebration here, mirroring the
  // rep-based effect's ROBOT_TARGET_CELEBRATION_MS treatment — purely cosmetic, doesn't touch
  // the hold timer or Finish.
  useEffect(() => {
    if (exerciseId === 'plank' && plankState.isHolding && !prevPlankHoldingRef.current) {
      pulseRep();
    }
    if (exerciseId === 'plank' && plankState.holdSeconds >= target && !plankTargetCelebratedRef.current) {
      plankTargetCelebratedRef.current = true;
      coachExpressionRef.current = 2;
      expressionLockedUntilRef.current = Date.now() + ROBOT_TARGET_CELEBRATION_MS;
      setCoachExpression(2);

      // Fire border pulse — same trigger point as the rep-based branch above.
      setFirePulseActive(true);
      if (firePulseTimerRef.current) clearTimeout(firePulseTimerRef.current);
      firePulseTimerRef.current = setTimeout(() => {
        firePulseTimerRef.current = null;
        setFirePulseActive(false);
      }, ROBOT_TARGET_CELEBRATION_MS);

      // Same fixed-delay rest-screen transition as the rep-based exercises above.
      if (exerciseId === 'plank' && currentSet < totalSets && !setTransitionScheduledRef.current) {
        setTransitionScheduledRef.current = true;
        const justCompletedSet = currentSet;
        setCompleteTimerRef.current = setTimeout(() => {
          setCompleteTimerRef.current = null;
          completedSetsRef.current = [...completedSetsRef.current, finalStatsRef.current];
          speakImmediate(`Set ${justCompletedSet} done!`);
          phaseRef.current = 'setComplete';
          setPhase('setComplete');
        }, SET_COMPLETE_TRANSITION_DELAY_MS);
      }
    }
    prevPlankHoldingRef.current = plankState.isHolding;
  }, [exerciseId, plankState.isHolding, plankState.holdSeconds, target, currentSet, totalSets]);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Camera permission required</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>No camera device found</Text>
      </View>
    );
  }

  // Calibration panel position — bottom third of screen, above debug badge.
  const calibPanelBottom = isLandscape ? 60 : 100;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={targetFps}
        isActive={!isChatOpen}
        frameProcessor={frameProcessor}
        onOutputOrientationChanged={(orientation) => {
          switch (orientation) {
            case 'landscape-left':       deviceOrientationDeg.value = 90;  break;
            case 'portrait-upside-down': deviceOrientationDeg.value = 180; break;
            case 'landscape-right':      deviceOrientationDeg.value = 270; break;
            default:                     deviceOrientationDeg.value = 0;
          }
        }}
        onError={(error) => console.warn('Camera error:', error.code, error.message)}
      />

      {/* Skeleton overlay — always mounted, cyan during calibration/countdown */}
      <SkeletonOverlay
        keypoints={animatedKeypoints}
        status={currentStatus}
        width={previewWidth}
        height={previewHeight}
      />

      {/* Fire border pulse — set-completion celebration. No explicit zIndex: declared here
          (right after the camera/skeleton) so every later-declared overlay (Finish button,
          calibration/countdown/set-complete cards, rep panels, debug badge) paints on top of
          it by declaration order, keeping it strictly behind all real UI chrome. statusBorder/
          perfHud/the coach avatar have their own explicit zIndex and stay above it too. */}
      <FireBorderPulse active={firePulseActive} />

      {/* Finish button */}
      <TouchableOpacity
        style={[styles.finishBtn, { top: insets.top + 12 }]}
        onPress={handleFinish}
      >
        <Text style={styles.finishBtnText}>Finish</Text>
      </TouchableOpacity>

      {/* ------------------------------------------------------------------ */}
      {/* Calibration overlay — shown during 'calibrating' and 'countdown'   */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'calibrating' && (
        <View style={[styles.calibPanel, { bottom: calibPanelBottom }]}>
          <Text style={styles.calibTitle}>CALIBRATING</Text>
          <Text style={styles.calibGuidance}>{calibGuidance}</Text>
          {stableFramesRef.current > 0 && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(stableFramesRef.current / CALIB_STABLE_FRAMES) * 100}%` },
                ]}
              />
            </View>
          )}
          {showLightingHint && (
            <Text style={styles.lightingHint}>
              💡 Lighting looks dim — turn on more lights for better tracking
            </Text>
          )}
        </View>
      )}

      {phase === 'countdown' && (
        <View style={styles.countdownOverlay}>
          <Animated.Text
            style={[styles.countdownNum, { transform: [{ scale: countdownScale }] }]}
          >
            {countdownNum}
          </Animated.Text>
          <Text style={styles.countdownSub}>Get ready!</Text>
        </View>
      )}

      {phase === 'setComplete' && (
        <View style={styles.setCompleteOverlay}>
          <Text style={styles.setCompleteTitle}>SET {currentSet} COMPLETE</Text>
          <Text style={styles.setCompleteSub}>Take a breather, then continue when ready.</Text>
          <TouchableOpacity style={styles.nextSetBtn} onPress={handleNextSet} activeOpacity={0.85}>
            <Text style={styles.nextSetBtnText}>Next Set — {currentSet + 1} of {totalSets}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Active phase UI — rep/hold panels                                  */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'active' && exerciseId === 'squat' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          {totalSets > 1 && <Text style={styles.setLabel}>SET {currentSet} / {totalSets}</Text>}
          <Text style={styles.repCount}>{squatState.counter}<Text style={styles.repTarget}> / {target}</Text></Text>
          <Text style={styles.stageLabel}>{squatState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{squatState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'pushup' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          {totalSets > 1 && <Text style={styles.setLabel}>SET {currentSet} / {totalSets}</Text>}
          <Text style={styles.repCount}>{pushupState.counter}<Text style={styles.repTarget}> / {target}</Text></Text>
          <Text style={styles.stageLabel}>{pushupState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{pushupState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'lunge' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          {totalSets > 1 && <Text style={styles.setLabel}>SET {currentSet} / {totalSets}</Text>}
          <Text style={styles.repCount}>{lungeState.counter}<Text style={styles.repTarget}> / {target}</Text></Text>
          <Text style={styles.stageLabel}>{lungeState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{lungeState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'plank' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          {totalSets > 1 && <Text style={styles.setLabel}>SET {currentSet} / {totalSets}</Text>}
          <Text style={styles.repCount}>{formatDuration(plankState.holdSeconds)}<Text style={styles.repTarget}> / {formatDuration(target)}</Text></Text>
          <Text style={styles.stageLabel}>{plankState.isHolding ? 'HOLDING' : 'PAUSED'}</Text>
          <Text style={styles.feedbackText}>{plankState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'situp' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          {totalSets > 1 && <Text style={styles.setLabel}>SET {currentSet} / {totalSets}</Text>}
          <Text style={styles.repCount}>{situpState.counter}<Text style={styles.repTarget}> / {target}</Text></Text>
          <Text style={styles.stageLabel}>{situpState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{situpState.feedback}</Text>
        </View>
      )}

      {/* Debug badge — bumped up during 'active' so it clears perfHud's 3-line block below it
          (perfHud sits at bottom: tabBarHeight+12 with ~60px of content height there, and has
          a higher zIndex, so without this the two were overlapping/painting over each other).
          No adjustment needed outside 'active': perfHud moves to the top in those phases. */}
      <View style={[styles.debugBadge, phase === 'active' && { bottom: tabBarHeight + 85 }]}>
        <Text style={styles.debugText}>
          {model
            ? `${phase.toUpperCase()}  •  Tracking ${trackedCount}/17${
                inferenceMs != null ? `  •  ${resizeMs}ms + ${inferenceMs}ms` : ''
              }`
            : '⏳ Loading model…'}
        </Text>
      </View>

      {/* Status border — thick coloured ring visible from far away */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.statusBorder, { borderColor: statusBorderColor, opacity: borderPulse }]}
      />

      {/* Performance HUD — MUST come after statusBorder in JSX and use zIndex > 1000
          so the absoluteFill status-border layer doesn't paint over it on Android.
          Set PERF_HUD_ENABLED=false in utils/debugFlags.ts before a demo to hide this. */}
      {PERF_HUD_ENABLED && (
        <View
          pointerEvents="none"
          style={[
            styles.perfHud,
            phase === 'active'
              ? { bottom: tabBarHeight + 12 }   // bottom-left: rep panel occupies top-left
              : { top: insets.top + 12 },        // top-left: calib panel occupies bottom-center
          ]}
        >
          <Text style={styles.perfHudText}>
            {`cam ${perfHud.camFps} fps  inf ${perfHud.inferFps} fps\n` +
             `infer ${perfHud.inferMs}ms  resize ${perfHud.resizeMs}ms\n` +
             `total ${perfHud.totalMs}ms  1:${INFER_EVERY_N_FRAMES}`}
          </Text>
        </View>
      )}

      {/* Circular coach avatar — top-right, below the Finish button.
          zIndex 1001 renders above the status border ring (zIndex 1000).
          Tune WORKOUT_ROBOT_SIZE / WORKOUT_ROBOT_RIGHT / WORKOUT_ROBOT_TOP_OFFSET above. */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleOpenChat}
        style={{
          position: 'absolute',
          right: WORKOUT_ROBOT_RIGHT,
          top: insets.top + WORKOUT_ROBOT_TOP_OFFSET,
          zIndex: 1001,
        }}
      >
        <CoachAvatarCircle size={WORKOUT_ROBOT_SIZE} expression={coachExpression} />
      </TouchableOpacity>

      <WorkoutChatOverlay
        visible={isChatOpen}
        onClose={handleCloseChat}
        exerciseName={EXERCISES[exerciseId].name}
        currentProgressLabel={
          exerciseId === 'plank'
            ? `${formatDuration(finalStatsRef.current.reps)} held so far`
            : `${finalStatsRef.current.reps} rep${finalStatsRef.current.reps === 1 ? '' : 's'} so far`
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    backgroundColor: '#0A0A1A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  text: { color: '#fff', fontSize: 16, textAlign: 'center' },
  finishBtn: {
    position: 'absolute',
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  finishBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Calibration panel
  calibPanel: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#00E5FF',
    minWidth: 240,
  },
  calibTitle: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
  },
  calibGuidance: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressBar: {
    marginTop: 12,
    width: 160,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 2,
  },
  // Countdown overlay
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNum: {
    color: '#fff',
    fontSize: 160,
    fontWeight: '900',
    textShadowColor: '#00E5FF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  countdownSub: {
    color: '#00E5FF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: -20,
  },
  // Set-complete rest screen — shown between sets. User-tapped continue, never an
  // auto-advancing timer (see SET_COMPLETE_TRANSITION_DELAY_MS, which only governs the
  // celebration -> this screen transition, not this screen -> the next set).
  setCompleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 32,
  },
  setCompleteTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: '#00E5FF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  setCompleteSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 32,
  },
  nextSetBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 28,
  },
  nextSetBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  // Active phase UI
  debugBadge: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  debugText: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  repPanel: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  setLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  repCount: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
  },
  // Nested inside repCount's <Text> (RN supports differently-styled nested Text inline) —
  // deliberately much smaller than repCount so "/ 12" reads as a subordinate suffix rather
  // than doubling the panel's visual weight. Auto-sizes with content since repPanel has no
  // fixed width, so this only ever makes the panel modestly wider, never wraps/clips.
  repTarget: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 22,
    fontWeight: '700',
  },
  stageLabel: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  feedbackText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  statusBorder: {
    borderWidth: 8,
    zIndex: 1000,
  },
  lightingHint: {
    color: '#FFD60A',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    opacity: 0.9,
  },
  perfHud: {
    position: 'absolute',
    // bottom is set inline from useBottomTabBarHeight() so it sits above the tab bar.
    left: 12,
    zIndex: 1002, // above statusBorder (1000) and avatar (1001); both are in other corners
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  perfHudText: {
    color: '#00E5FF',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
    opacity: 0.9,
  },
});
