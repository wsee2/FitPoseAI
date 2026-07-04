import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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
import { speakFeedback, speakImmediate, reset as ttsReset } from '../services/ttsService';
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
      return { reps: plankState.holdSeconds, score: plankState.holdSeconds };
    case 'situp':
      return { reps: situpState.counter, score: situpState.score };
    default:
      return { reps: 0, score: 0 };
  }
}

const INFER_EVERY_N_FRAMES = 1;
const SMOOTHING_MS = 50;

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

const DEBUG = true;

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
// Calibration phase
type WorkoutPhase = 'calibrating' | 'countdown' | 'active';

// Keypoints that must ALL be visible and in-frame before the workout starts.
const CALIB_REQUIRED_KPS = [0, 5, 6, 11, 12, 13, 14, 15, 16]; // nose, shoulders, hips, knees, ankles
// Margin from edge: keypoints within [MARGIN, 1-MARGIN] are considered "in frame".
const CALIB_FRAME_MARGIN = 0.05;
// Consecutive valid frames required before triggering the countdown.
const CALIB_STABLE_FRAMES = 8;
// For upright exercises: ankleY - shoulderY must exceed this (world-upright fsmKp frame).
const CALIB_UPRIGHT_SPREAD = 0.4;
// For horizontal exercises: abs(shoulderY - ankleY) must be below this.
const CALIB_HORIZONTAL_SPREAD = 0.25;
// Exercises that require a horizontal body posture.
const HORIZONTAL_EXERCISES = new Set(['pushup', 'plank']);

/**
 * Returns { valid, guidance } based on fsmKp (world-upright normalized keypoints).
 * Called on every frame during 'calibrating' and 'countdown' phases.
 */
function checkCalibration(fsmKp: number[], exerciseId: string): { valid: boolean; guidance: string } {
  // 1. All required keypoints above confidence threshold.
  const allDetected = CALIB_REQUIRED_KPS.every((i) => (fsmKp[i * 3 + 2] ?? 0) >= CONF_THRESHOLD);
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

  // 3. Exercise-specific posture check using orientation-normalized coordinates.
  const shoulderY = ((fsmKp[5 * 3] ?? 0) + (fsmKp[6 * 3] ?? 0)) / 2;
  const ankleY   = ((fsmKp[15 * 3] ?? 0) + (fsmKp[16 * 3] ?? 0)) / 2;

  if (HORIZONTAL_EXERCISES.has(exerciseId)) {
    if (Math.abs(shoulderY - ankleY) >= CALIB_HORIZONTAL_SPREAD) {
      return { valid: false, guidance: 'Get into position — body horizontal' };
    }
  } else {
    if (ankleY - shoulderY <= CALIB_UPRIGHT_SPREAD) {
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
  const deviceOrientationDeg = useSharedValue(isLandscape ? 90 : 0);
  const animatedKeypoints = useReanimatedValue<number[]>(new Array(51).fill(0));

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

  // Session bookkeeping
  const sessionStartRef = useRef(Date.now());
  const hasSavedRef = useRef(false);

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
  const stableFramesRef = useRef(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scale animation for the countdown digit.
  const countdownScale = useRef(new Animated.Value(1)).current;
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
    sessionStartRef.current = Date.now();
    hasSavedRef.current = false;
    ttsReset();
  }, [exerciseId]);

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
        // Session timer starts NOW (not at screen mount, not during calibration).
        sessionStartRef.current = Date.now();
        hasSavedRef.current = false;
        ttsReset();

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
  }, [phase, exerciseId]);

  const finalStatsRef = useRef({ reps: 0, score: 0 });
  finalStatsRef.current = getFinalStats(
    exerciseId, squatState, pushupState, lungeState, plankState, situpState
  );

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
    (kp: number[], inferMs: number, resizeMsArg: number, orientationDeg: number) => {
      setKeypoints(kp);
      setInferenceMs(inferMs);
      setResizeMs(resizeMsArg);

      // (a) Display copy — overlay transform, portrait = identity.
      let displayKp: number[];
      if (orientationDeg === 90) {
        displayKp = applyOverlayTransform(kp, LANDSCAPE_LEFT_TRANSFORM);
      } else if (orientationDeg === 270) {
        displayKp = applyOverlayTransform(kp, LANDSCAPE_RIGHT_TRANSFORM);
      } else {
        displayKp = kp;
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

      // ---------------------------------------------------------------------------
      // Phase-gated logic: FSMs only run during 'active'.
      const currentPhase = phaseRef.current;

      if (currentPhase === 'calibrating') {
        const { valid, guidance } = checkCalibration(fsmKp, exerciseId);
        if (valid) {
          stableFramesRef.current += 1;
          if (stableFramesRef.current >= CALIB_STABLE_FRAMES) {
            // Enough stable frames — kick off countdown.
            stableFramesRef.current = 0;
            phaseRef.current = 'countdown';
            setPhase('countdown');
          } else {
            // Show stabilizing guidance (only update state when text changes).
            if (calibGuidanceRef.current !== 'Hold still...') {
              calibGuidanceRef.current = 'Hold still...';
              setCalibGuidance('Hold still...');
            }
            speakFeedback('Hold still');
          }
        } else {
          stableFramesRef.current = 0;
          if (calibGuidanceRef.current !== guidance) {
            calibGuidanceRef.current = guidance;
            setCalibGuidance(guidance);
          }
          speakFeedback(guidance);
        }
        return; // Never call FSMs during calibration.
      }

      if (currentPhase === 'countdown') {
        // If the user steps out of frame during countdown, cancel it.
        const { valid } = checkCalibration(fsmKp, exerciseId);
        if (!valid) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          stableFramesRef.current = 0;
          const msg = 'Come back into the frame';
          calibGuidanceRef.current = msg;
          setCalibGuidance(msg);
          phaseRef.current = 'calibrating';
          setPhase('calibrating');
          speakFeedback(msg);
        }
        return; // Never call FSMs during countdown.
      }

      // 'active' — existing FSM logic.
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
      updateKeypoints(Array.from(out), inferElapsedMs, resizeElapsedMs, deviceOrientationDeg.value);
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

  const trackedCount =
    keypoints.length >= 51
      ? Array.from({ length: 17 }, (_, i) => keypoints[i * 3 + 2]).filter(
          (c) => c >= CONF_THRESHOLD
        ).length
      : 0;

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

  // Calibration panel position — bottom third of screen, above debug badge.
  const calibPanelBottom = isLandscape ? 60 : 100;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
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

      {/* ------------------------------------------------------------------ */}
      {/* Active phase UI — rep/hold panels                                  */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'active' && exerciseId === 'squat' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{squatState.counter}</Text>
          <Text style={styles.stageLabel}>{squatState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{squatState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'pushup' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{pushupState.counter}</Text>
          <Text style={styles.stageLabel}>{pushupState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{pushupState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'lunge' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{lungeState.counter}</Text>
          <Text style={styles.stageLabel}>{lungeState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{lungeState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'plank' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{formatDuration(plankState.holdSeconds)}</Text>
          <Text style={styles.stageLabel}>{plankState.isHolding ? 'HOLDING' : 'PAUSED'}</Text>
          <Text style={styles.feedbackText}>{plankState.feedback}</Text>
        </View>
      )}
      {phase === 'active' && exerciseId === 'situp' && (
        <View style={[styles.repPanel, repPanelDynamicStyle]}>
          <Text style={styles.repCount}>{situpState.counter}</Text>
          <Text style={styles.stageLabel}>{situpState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{situpState.feedback}</Text>
        </View>
      )}

      {/* Debug badge */}
      <View style={styles.debugBadge}>
        <Text style={styles.debugText}>
          {model
            ? `${phase.toUpperCase()}  •  Tracking ${trackedCount}/17${
                inferenceMs != null ? `  •  ${resizeMs}ms + ${inferenceMs}ms` : ''
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
