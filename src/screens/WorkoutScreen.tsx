import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { NitroModules } from 'react-native-nitro-modules';
import { useSharedValue } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import type { TensorflowModel } from 'react-native-fast-tflite';
import type { HomeStackParamList } from '../navigation/types';
import { loadMoveNetModel } from '../services/moveNet';

// Tune this to reduce CPU load on slower devices (2 = every other frame)
const INFER_EVERY_N_FRAMES = 2;

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

export default function WorkoutScreen({ navigation: _navigation, route: _route }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = frontDevice ?? backDevice;

  const [model, setModel] = useState<TensorflowModel | null>(null);

  // Thread-safe frame counter from worklets-core (same runtime as VisionCamera)
  const frameCount = useSharedValue(0);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    loadMoveNetModel()
      .then(setModel)
      .catch((err) => console.error('MoveNet load failed:', err));
  }, []);

  // TfliteModel is a Nitro HybridObject (jsi::NativeState).
  // VisionCamera v4's worklet runtime cannot access NativeState directly —
  // box() wraps it as a HostObject that crosses the worklet boundary,
  // then unbox() recovers the original model inside the worklet.
  const boxedModel = useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model]
  );

  const { resize } = useResizePlugin();

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';

      // Throttle: skip frames to cap CPU usage (tune INFER_EVERY_N_FRAMES above)
      frameCount.value += 1;
      if (frameCount.value % INFER_EVERY_N_FRAMES !== 0) return;

      if (boxedModel == null) return;
      // Unbox the HybridObject so the worklet runtime can call runSync
      const tflite = boxedModel.unbox();

      // 1. Resize camera frame → 192×192 RGB uint8 (MoveNet Lightning INT8 input)
      const resized = resize(frame, {
        scale: { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType: 'uint8',
      });

      // 2. Slice the exact bytes — TypedArray byteOffset can be non-zero in a shared buffer
      const inputBuffer = resized.buffer.slice(
        resized.byteOffset,
        resized.byteOffset + resized.byteLength
      );

      // 3. Synchronous TFLite inference
      const outputs = tflite.runSync([inputBuffer]);

      // 4. Output: [1,1,17,3] tensor flattened to 51 floats.
      //    Keypoint i → y = out[i*3], x = out[i*3+1], conf = out[i*3+2]
      const out = new Float32Array(outputs[0]!);

      // Log nose (keypoint 0) as a live-inference sanity check
      console.log(
        `nose y=${out[0].toFixed(2)} x=${out[1].toFixed(2)} conf=${out[2].toFixed(2)}`
      );
    },
    [boxedModel, frameCount, resize]
  );

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
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>
          Phase 3: MoveNet inference{'\n'}
          {model ? '✅ Model ready — check Metro logs' : '⏳ Loading model…'}
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
  overlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  overlayText: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    textAlign: 'center',
  },
});
