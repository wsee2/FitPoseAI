import React, { useEffect, useMemo, useState } from 'react';
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

export default function WorkoutScreen({ navigation: _navigation, route: _route }: Props) {
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
    },
    []
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
});
