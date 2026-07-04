import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
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
import { loadMoveNetModel } from '../services/moveNet';
import { useApp } from '../context/AppContext';
import { EXERCISES, formatDuration, type WorkoutSession } from '../data/exercises';
import { saveWorkout } from '../services/firebaseWorkout';
import { speakFeedback, reset as ttsReset } from '../services/ttsService';
import { INITIAL_SQUAT_STATE, SquatFsm, type SquatFsmState } from '../services/fsm/squatFsm';
import { INITIAL_PUSHUP_STATE, PushupFsm, type PushupFsmState } from '../services/fsm/pushupFsm';
import { INITIAL_LUNGE_STATE, LungeFsm, type LungeFsmState } from '../services/fsm/lungeFsm';
import { INITIAL_PLANK_STATE, PlankFsm, type PlankFsmState } from '../services/fsm/plankFsm';
import { INITIAL_SITUP_STATE, SitupFsm, type SitupFsmState } from '../services/fsm/situpFsm';
import SkeletonOverlay, { CONF_THRESHOLD, type SkeletonStatus } from '../components/SkeletonOverlay';

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
      // Plank is time-based: hold-seconds doubles as both "reps" and score, matching the prototype.
      return { reps: plankState.holdSeconds, score: plankState.holdSeconds };
    case 'situp':
      return { reps: situpState.counter, score: situpState.score };
    default:
      return { reps: 0, score: 0 };
  }
}

// Tune: run inference every N frames. Inference itself (not this throttle) is the real
// bottleneck — VisionCamera already drops frames it doesn't have time to process — so this
// is left at 1 to avoid adding an extra artificial frame-interval of latency on top.
const INFER_EVERY_N_FRAMES = 1;

// Short, FIXED glide just to remove single-frame "popping" — intentionally much shorter than
// the typical inter-sample gap (~70-120ms) so it finishes and the overlay sits still at the
// latest known position, rather than perpetually chasing. A duration close to or longer than
// the real sample gap makes the overlay permanently trail behind by ~that long; this is the
// trade-off knob between snappy (low value) and silky (high value, but adds visible lag).
const SMOOTHING_MS = 50;

// Returns counter-rotation degrees for the (constant) sensor-mounted frame orientation.
function getCounterRotationDeg(orientation: Frame['orientation']): number {
  'worklet';
  switch (orientation) {
    case 'landscape-left':       return 270;
    case 'portrait-upside-down': return 180;
    case 'landscape-right':      return 90;
    default:                     return 0;
  }
}

// Maps total rotation degrees to the resize plugin's string format.
function degreesToResizeRotation(deg: number): '0deg' | '90deg' | '180deg' | '270deg' {
  'worklet';
  switch (deg) {
    case 90:  return '90deg';
    case 180: return '180deg';
    case 270: return '270deg';
    default:  return '0deg';
  }
}

// Set true temporarily to log keypoint y-values for orientation debugging.
const DEBUG = true;

// ---------------------------------------------------------------------------
// Landscape overlay transform config.
// Derivation: in landscape the camera preview applies 180°CW + x-mirror to the
// raw buffer; MoveNet gets the raw buffer (no rotation, totalDeg=0) for landscape-
// left and 180°CW for landscape-right. Working through the math, both orientations
// need the kp array's y and x slots flipped (display_y=1-y, display_x=1-x) so the
// overlay formula cx=(1-display_x)*W cy=display_y*H maps to the preview position.
//
// If the skeleton is still misaligned after testing, change the constants:
//   'flip_both': flip both y and x  — the theoretically correct default
//   '90':        90°CCW  cx=(1-kp_y)*W  cy=(1-kp_x)*H
//   '270':       90°CW   cx=kp_y*W      cy=kp_x*H
//   '90_mirror': 90°CCW+mirror  cx=kp_y*W   cy=(1-kp_x)*H
//   '270_mirror':90°CW+mirror   cx=(1-kp_y)*W cy=kp_x*H
type OverlayTransform = 'flip_both' | '90' | '270' | '90_mirror' | '270_mirror';

const LANDSCAPE_LEFT_TRANSFORM: OverlayTransform = '90';
const LANDSCAPE_RIGHT_TRANSFORM: OverlayTransform = '270';

// FSM-input normalization: converts raw MoveNet keypoints into a consistent world-upright frame
// so all direction-dependent FSM checks (y-axis comparisons like torso_elevated, arms_supporting)
// work correctly regardless of device orientation.
//   Portrait (0° / 180°): strict identity — squat/lunge portrait behavior is unchanged.
//   Landscape: flip_both realigns +y = gravity (head-to-toe) for horizontal-pose exercises.
// If a landscape case still misfires, change the constant for that orientation to '90' or '270'
// (same option set as the overlay) and Metro-reload — no logic changes needed.
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

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

export default function WorkoutScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const { width: previewWidth, height: previewHeight } = useWindowDimensions();
  const isLandscape = previewWidth > previewHeight;
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const { addWorkoutSession } = useApp();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = frontDevice ?? backDevice;

  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [keypoints, setKeypoints] = useState<number[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [resizeMs, setResizeMs] = useState<number | null>(null);
  const frameCount = useSharedValue(0);
  // Physical device orientation as additional rotation degrees to compound with sensor correction.
  // Initialized from current window dimensions so it's correct before any rotation event fires.
  // Updated via Camera's onOutputOrientationChanged for precise landscape-left vs landscape-right.
  const deviceOrientationDeg = useSharedValue(isLandscape ? 90 : 0);
  // Drives the overlay's animated render — interpolated toward each new sample
  const animatedKeypoints = useReanimatedValue<number[]>(new Array(51).fill(0));

  // One FSM instance per exercise, all live for the screen's lifetime; trivial constructors
  // so re-creating them on a hot-reload/re-render is harmless. Only the active exerciseId's
  // FSM is fed frames and reset.
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

  // Session bookkeeping: sessionStartRef marks when this exercise attempt began (for duration);
  // hasSavedRef guards against saving twice (e.g. Finish button tap racing the unmount cleanup).
  const sessionStartRef = useRef(Date.now());
  const hasSavedRef = useRef(false);

  // Reset the active exercise's FSM (and session bookkeeping) whenever the screen is entered or
  // the exercise changes, so leftover state from a prior session doesn't bleed in.
  useEffect(() => {
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
    sessionStartRef.current = Date.now();
    hasSavedRef.current = false;
    ttsReset();
  }, [exerciseId]);

  // Kept in sync every render (a ref mutation during render is safe and avoids re-subscribing
  // an effect on every FSM update) so the unmount cleanup below can always read the latest reps/score.
  const finalStatsRef = useRef({ reps: 0, score: 0 });
  finalStatsRef.current = getFinalStats(
    exerciseId,
    squatState,
    pushupState,
    lungeState,
    plankState,
    situpState
  );

  // Builds and saves the session exactly once (local history + Firebase). Returns the saved
  // session so the Finish button can navigate to its summary; returns undefined if there was
  // nothing worth saving (0 reps/score) or it was already saved.
  const persistSession = useCallback((): WorkoutSession | undefined => {
    if (hasSavedRef.current) return undefined;
    const { reps, score } = finalStatsRef.current;
    if (reps <= 0 && score <= 0) return undefined;
    hasSavedRef.current = true;

    const exercise = EXERCISES[exerciseId];
    const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
    const session: WorkoutSession = {
      id: Date.now().toString(),
      exerciseId,
      date: new Date().toISOString().split('T')[0],
      reps,
      duration,
      score,
      calories: Math.round(reps * exercise.calories),
      formQuality:
        score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Needs Work',
    };
    addWorkoutSession(session);
    saveWorkout(exerciseId.toUpperCase(), reps, score);
    return session;
  }, [exerciseId, addWorkoutSession]);

  const handleFinish = useCallback(() => {
    const session = persistSession();
    if (session) {
      navigation.replace('SessionSummary', { sessionId: session.id });
    } else {
      navigation.goBack();
    }
  }, [persistSession, navigation]);

  // Save on unmount too (e.g. swipe-back / hardware back), so leaving the screen any other way
  // than the Finish button still persists the session. Reads persistSession via a ref so this
  // effect only needs to subscribe once, at mount, while always calling the latest closure.
  const persistSessionRef = useRef(persistSession);
  persistSessionRef.current = persistSession;
  useEffect(() => {
    return () => {
      persistSessionRef.current();
    };
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    loadMoveNetModel()
      .then(setModel)
      .catch((err) => console.error('MoveNet load failed:', err));
  }, []);

  // TfliteModel is a Nitro HybridObject — must be boxed before the worklet boundary
  const boxedModel = useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model]
  );

  const { resize } = useResizePlugin();

  // Bridge: called from worklet thread, runs on the JS/React thread.
  // orientationDeg = deviceOrientationDeg.value at the time of the frame:
  //   0=portrait, 90=landscape-left, 180=portrait-upside-down, 270=landscape-right.
  // displayKp is a COPY used only for the overlay; FSMs always receive raw kp.
  const updateKeypoints = useRunOnJS(
    (kp: number[], inferMs: number, resizeMsArg: number, orientationDeg: number) => {
      setKeypoints(kp);
      setInferenceMs(inferMs);
      setResizeMs(resizeMsArg);

      // (a) Display copy — overlay transform only, portrait is identity.
      let displayKp: number[];
      if (orientationDeg === 90) {
        displayKp = applyOverlayTransform(kp, LANDSCAPE_LEFT_TRANSFORM);
      } else if (orientationDeg === 270) {
        displayKp = applyOverlayTransform(kp, LANDSCAPE_RIGHT_TRANSFORM);
      } else {
        displayKp = kp;
      }

      // (b) Analysis copy — FSM normalization so +y = gravity in every orientation.
      //     Portrait (0 / 180) = strict identity; landscape = flip_both by default.
      let fsmKp: number[];
      if (orientationDeg === 90) {
        fsmKp = applyOverlayTransform(kp, FSM_LANDSCAPE_LEFT_TRANSFORM);
      } else if (orientationDeg === 270) {
        fsmKp = applyOverlayTransform(kp, FSM_LANDSCAPE_RIGHT_TRANSFORM);
      } else {
        fsmKp = kp;
      }

      animatedKeypoints.value = withTiming(displayKp, {
        duration: SMOOTHING_MS,
        easing: Easing.linear,
      });
      if (DEBUG) {
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
      switch (exerciseId) {
        case 'squat': {
          const s = squatFsmRef.current.update(fsmKp);
          setSquatState(s);
          speakFeedback(s.feedback);
          break;
        }
        case 'pushup': {
          const s = pushupFsmRef.current.update(fsmKp);
          setPushupState(s);
          speakFeedback(s.feedback);
          break;
        }
        case 'lunge': {
          const s = lungeFsmRef.current.update(fsmKp);
          setLungeState(s);
          speakFeedback(s.feedback);
          break;
        }
        case 'plank': {
          const s = plankFsmRef.current.update(fsmKp);
          setPlankState(s);
          speakFeedback(s.feedback);
          break;
        }
        case 'situp': {
          const s = situpFsmRef.current.update(fsmKp);
          setSitupState(s);
          speakFeedback(s.feedback);
          break;
        }
      }
    },
    [exerciseId]
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';

      // Throttle inference to every Nth frame for S8 performance
      frameCount.value += 1;
      if (frameCount.value % INFER_EVERY_N_FRAMES !== 0) return;

      if (boxedModel == null) return;
      const tflite = boxedModel.unbox();

      // 1. Resize to 192×192 RGB uint8 (MoveNet Lightning INT8 input format).
      //    frame.orientation is CONSTANT (VisionCamera never sets targetRotation for frame processors),
      //    so getCounterRotationDeg gives the base sensor correction. deviceOrientationDeg.value adds
      //    the physical device rotation so MoveNet always receives an upright-for-current-orientation frame.
      const baseDeg = getCounterRotationDeg(frame.orientation);
      const totalDeg = (baseDeg + deviceOrientationDeg.value) % 360;
      const rotation = degreesToResizeRotation(totalDeg);
      const resizeStartedAt = Date.now();
      const resized = resize(frame, {
        scale: { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType: 'uint8',
        rotation,
      });
      const resizeElapsedMs = Date.now() - resizeStartedAt;

      // 2. Slice exact bytes (TypedArray byteOffset can be non-zero in shared buffers)
      const inputBuffer = resized.buffer.slice(
        resized.byteOffset,
        resized.byteOffset + resized.byteLength
      ) as ArrayBuffer;

      // 3. Synchronous inference (timed to surface real on-device latency)
      const inferStartedAt = Date.now();
      const outputs = tflite.runSync([inputBuffer]);
      const inferElapsedMs = Date.now() - inferStartedAt;

      // 4. Output [1,1,17,3] = 51 floats: keypoint i → y=out[i*3], x=out[i*3+1], conf=out[i*3+2]
      const out = new Float32Array(outputs[0]!);

      // Convert Float32Array → number[] before crossing the worklet→JS bridge.
      // Pass orientation so updateKeypoints can apply the correct display transform.
      updateKeypoints(Array.from(out), inferElapsedMs, resizeElapsedMs, deviceOrientationDeg.value);
    },
    [boxedModel, frameCount, deviceOrientationDeg, resize, updateKeypoints]
  );

  // Count how many keypoints are above the draw threshold (for debug display)
  const trackedCount =
    keypoints.length >= 51
      ? Array.from({ length: 17 }, (_, i) => keypoints[i * 3 + 2]).filter(
          (c) => c >= CONF_THRESHOLD
        ).length
      : 0;

  let currentStatus: SkeletonStatus;
  switch (exerciseId) {
    case 'squat':  currentStatus = squatState.status; break;
    case 'pushup': currentStatus = pushupState.status; break;
    case 'lunge':  currentStatus = lungeState.status; break;
    case 'plank':  currentStatus = plankState.status; break;
    case 'situp':  currentStatus = situpState.status; break;
    default:       currentStatus = 'guide';
  }

  const repPanelDynamicStyle = isLandscape
    ? { left: 12, top: Math.round(previewHeight * 0.3), alignSelf: 'flex-start' as const }
    : { top: insets.top + 50, alignSelf: 'center' as const };

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

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        onOutputOrientationChanged={(orientation) => {
          switch (orientation) {
            case 'landscape-left':       deviceOrientationDeg.value = 90; break;
            case 'portrait-upside-down': deviceOrientationDeg.value = 180; break;
            case 'landscape-right':      deviceOrientationDeg.value = 270; break;
            default:                     deviceOrientationDeg.value = 0;
          }
        }}
        onError={(error) => console.warn('Camera error:', error.code, error.message)}
      />
      <SkeletonOverlay
        keypoints={animatedKeypoints}
        status={currentStatus}
        width={previewWidth}
        height={previewHeight}
      />
      <TouchableOpacity
        style={[styles.finishBtn, { top: insets.top + 12 }]}
        onPress={handleFinish}
      >
        <Text style={styles.finishBtnText}>Finish</Text>
      </TouchableOpacity>
      {exerciseId === 'squat' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{squatState.counter}</Text>
          <Text style={styles.stageLabel}>{squatState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{squatState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'pushup' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{pushupState.counter}</Text>
          <Text style={styles.stageLabel}>{pushupState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{pushupState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'lunge' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{lungeState.counter}</Text>
          <Text style={styles.stageLabel}>{lungeState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{lungeState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'plank' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{formatDuration(plankState.holdSeconds)}</Text>
          <Text style={styles.stageLabel}>{plankState.isHolding ? 'HOLDING' : 'PAUSED'}</Text>
          <Text style={styles.feedbackText}>{plankState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'situp' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{situpState.counter}</Text>
          <Text style={styles.stageLabel}>{situpState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{situpState.feedback}</Text>
        </View>
      )}
      <View style={styles.debugBadge}>
        <Text style={styles.debugText}>
          {model
            ? `Tracking ${trackedCount}/17${
                inferenceMs != null ? `  •  ${resizeMs}ms resize + ${inferenceMs}ms infer` : ''
              }`
            : '⏳ Loading model…'}
        </Text>
      </View>
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
  repCount: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
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
});
