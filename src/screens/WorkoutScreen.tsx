import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
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
import { formatDuration } from '../data/exercises';
import { INITIAL_SQUAT_STATE, SquatFsm, type SquatFsmState } from '../services/fsm/squatFsm';
import { INITIAL_PUSHUP_STATE, PushupFsm, type PushupFsmState } from '../services/fsm/pushupFsm';
import { INITIAL_LUNGE_STATE, LungeFsm, type LungeFsmState } from '../services/fsm/lungeFsm';
import { INITIAL_PLANK_STATE, PlankFsm, type PlankFsmState } from '../services/fsm/plankFsm';
import { INITIAL_SITUP_STATE, SitupFsm, type SitupFsmState } from '../services/fsm/situpFsm';
import SkeletonOverlay, { CONF_THRESHOLD } from '../components/SkeletonOverlay';

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

// frame.orientation tells us how far the raw sensor buffer (e.g. 640x480 landscape)
// is rotated relative to upright. Counter-rotate by the inverse so the buffer we feed
// MoveNet — and therefore its normalized x/y output — is upright and matches the portrait screen.
function getCounterRotation(orientation: Frame['orientation']): '0deg' | '90deg' | '180deg' | '270deg' {
  'worklet';
  switch (orientation) {
    case 'landscape-left':
      return '270deg';
    case 'portrait-upside-down':
      return '180deg';
    case 'landscape-right':
      return '90deg';
    case 'portrait':
    default:
      return '0deg';
  }
}

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

export default function WorkoutScreen({ navigation: _navigation, route }: Props) {
  const { exerciseId } = route.params;
  const { width: previewWidth, height: previewHeight } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = frontDevice ?? backDevice;

  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [keypoints, setKeypoints] = useState<number[]>([]);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [resizeMs, setResizeMs] = useState<number | null>(null);
  const frameCount = useSharedValue(0);
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

  // Reset the active exercise's FSM whenever the screen is entered or the exercise changes,
  // so leftover state (counter, stage, smoothing buffers) from a prior session doesn't bleed in.
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
  }, [exerciseId]);

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

  // Bridge: called from worklet thread, runs setKeypoints on the JS/React thread
  const updateKeypoints = useRunOnJS(
    (kp: number[], inferMs: number, resizeMsArg: number) => {
      setKeypoints(kp);
      setInferenceMs(inferMs);
      setResizeMs(resizeMsArg);
      animatedKeypoints.value = withTiming(kp, {
        duration: SMOOTHING_MS,
        easing: Easing.linear,
      });
      switch (exerciseId) {
        case 'squat':
          setSquatState(squatFsmRef.current.update(kp));
          break;
        case 'pushup':
          setPushupState(pushupFsmRef.current.update(kp));
          break;
        case 'lunge':
          setLungeState(lungeFsmRef.current.update(kp));
          break;
        case 'plank':
          setPlankState(plankFsmRef.current.update(kp));
          break;
        case 'situp':
          setSitupState(situpFsmRef.current.update(kp));
          break;
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

      // 1. Resize to 192×192 RGB uint8 (MoveNet Lightning INT8 input format),
      //    counter-rotating so the buffer MoveNet sees is upright regardless of sensor mounting.
      //    Timed separately from inference since this step's cost was previously invisible.
      const rotation = getCounterRotation(frame.orientation);
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

      // Convert Float32Array → number[] before crossing the worklet→JS bridge
      updateKeypoints(Array.from(out), inferElapsedMs, resizeElapsedMs);
    },
    [boxedModel, frameCount, resize, updateKeypoints]
  );

  // Count how many keypoints are above the draw threshold (for debug display)
  const trackedCount =
    keypoints.length >= 51
      ? Array.from({ length: 17 }, (_, i) => keypoints[i * 3 + 2]).filter(
          (c) => c >= CONF_THRESHOLD
        ).length
      : 0;

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
        onError={(error) => console.warn('Camera error:', error.code, error.message)}
      />
      <SkeletonOverlay
        keypoints={animatedKeypoints}
        width={previewWidth}
        height={previewHeight}
      />
      {exerciseId === 'squat' && (
        <View style={styles.repPanel}>
          <Text style={styles.repCount}>{squatState.counter}</Text>
          <Text style={styles.stageLabel}>{squatState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{squatState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'pushup' && (
        <View style={styles.repPanel}>
          <Text style={styles.repCount}>{pushupState.counter}</Text>
          <Text style={styles.stageLabel}>{pushupState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{pushupState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'lunge' && (
        <View style={styles.repPanel}>
          <Text style={styles.repCount}>{lungeState.counter}</Text>
          <Text style={styles.stageLabel}>{lungeState.stage ?? '—'}</Text>
          <Text style={styles.feedbackText}>{lungeState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'plank' && (
        <View style={styles.repPanel}>
          <Text style={styles.repCount}>{formatDuration(plankState.holdSeconds)}</Text>
          <Text style={styles.stageLabel}>{plankState.isHolding ? 'HOLDING' : 'PAUSED'}</Text>
          <Text style={styles.feedbackText}>{plankState.feedback}</Text>
        </View>
      )}
      {exerciseId === 'situp' && (
        <View style={styles.repPanel}>
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
    top: 60,
    alignSelf: 'center',
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
