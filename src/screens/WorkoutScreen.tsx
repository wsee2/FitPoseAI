import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

export default function WorkoutScreen({ navigation: _navigation, route: _route }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = frontDevice ?? backDevice;

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    console.log(`Frame: ${frame.width}x${frame.height}`);
  }, []);

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
          Phase 2: frame processor test — check Metro logs
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
