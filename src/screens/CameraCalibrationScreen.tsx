import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, Line, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, BorderRadius } from '../theme';
import { NeonButton } from '../components/ui/NeonButton';
import { EXERCISES } from '../data/exercises';
import type { HomeStackParamList } from '../navigation/types';

const { width, height } = Dimensions.get('window');
type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'CameraCalibration'>;
  route: RouteProp<HomeStackParamList, 'CameraCalibration'>;
};

const CHECKLIST = [
  { id: 'body', label: 'Full body visible' },
  { id: 'lighting', label: 'Good lighting' },
  { id: 'space', label: 'Enough space around you' },
  { id: 'camera', label: 'Camera at correct angle' },
];

export default function CameraCalibrationScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const exercise = EXERCISES[exerciseId];
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const scanAnim = useRef(new Animated.Value(-1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    requestPermission();
  }, []);

  useEffect(() => {
    if (hasPermission) {
      const timer = setTimeout(() => {
        setCheckedItems({ body: true, lighting: true, space: true, camera: true });
        setIsReady(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [hasPermission]);

  useEffect(() => {
    // Scanning animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: -1, duration: 0, useNativeDriver: true }),
      ])
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleStartCountdown = () => {
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        navigation.replace('Workout', { exerciseId });
      } else {
        setCountdown(count);
        Animated.sequence([
          Animated.timing(countdownAnim, { toValue: 1.4, duration: 200, useNativeDriver: true }),
          Animated.timing(countdownAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    }, 1000);
  };

  const scanTranslate = scanAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-200, 200],
  });

  const isFrontFacing = exercise.id === 'squat' || exercise.id === 'lunge';
  const cameraDirection = isFrontFacing ? 'Face the camera' : 'Side profile to camera';

  return (
    <View style={styles.container}>
      {/* Camera preview or placeholder */}
      {hasPermission && device ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]}>
          <LinearGradient colors={['#050510', '#0A0A20']} style={StyleSheet.absoluteFill} />
        </View>
      )}

      {/* Dark overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Body silhouette guide */}
      <View style={styles.silhouetteArea}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Svg width={180} height={340} viewBox="0 0 180 340" fill="none">
            <Defs>
              <SvgGrad id="siG" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={exercise.accentColor} stopOpacity="0.8" />
                <Stop offset="100%" stopColor={exercise.accentColor} stopOpacity="0.2" />
              </SvgGrad>
            </Defs>
            {/* Body outline */}
            <Circle cx="90" cy="36" r="28" stroke="url(#siG)" strokeWidth="2" strokeDasharray="6 3" fill="none" />
            <Path d="M90 64 L90 160" stroke="url(#siG)" strokeWidth="2" strokeDasharray="6 3" />
            <Path d="M40 100 L90 110 L140 100" stroke="url(#siG)" strokeWidth="2" strokeDasharray="6 3" strokeLinejoin="round" />
            <Path d="M90 160 L60 240 L50 310" stroke="url(#siG)" strokeWidth="2" strokeDasharray="6 3" strokeLinejoin="round" />
            <Path d="M90 160 L120 240 L130 310" stroke="url(#siG)" strokeWidth="2" strokeDasharray="6 3" strokeLinejoin="round" />
          </Svg>
        </Animated.View>

        {/* Scan line */}
        <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanTranslate }] }]}>
          <LinearGradient colors={['transparent', exercise.accentColor, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 2, flex: 1 }} />
        </Animated.View>

        {/* Corner guides */}
        {[
          { top: -4, left: -4 },
          { top: -4, right: -4 },
          { bottom: -4, left: -4 },
          { bottom: -4, right: -4 },
        ].map((pos, i) => (
          <View key={i} style={[styles.corner, pos]}>
            <Svg width={20} height={20} viewBox="0 0 20 20">
              {i === 0 && <><Line x1="0" y1="0" x2="0" y2="12" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /><Line x1="0" y1="0" x2="12" y2="0" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /></>}
              {i === 1 && <><Line x1="20" y1="0" x2="20" y2="12" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /><Line x1="20" y1="0" x2="8" y2="0" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /></>}
              {i === 2 && <><Line x1="0" y1="20" x2="0" y2="8" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /><Line x1="0" y1="20" x2="12" y2="20" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /></>}
              {i === 3 && <><Line x1="20" y1="20" x2="20" y2="8" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /><Line x1="20" y1="20" x2="8" y2="20" stroke={exercise.accentColor} strokeWidth="2.5" strokeLinecap="round" /></>}
            </Svg>
          </View>
        ))}
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.exerciseBadge}>
          <Text style={[styles.exerciseBadgeText, { color: exercise.accentColor }]}>{exercise.name}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Direction badge */}
      <View style={styles.directionBadge}>
        <Text style={styles.directionText}>📷 {cameraDirection}</Text>
      </View>

      {/* Bottom panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 20 }]}>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.95)']} style={StyleSheet.absoluteFill} />

        <Text style={styles.panelTitle}>Camera Setup</Text>

        {/* Checklist */}
        <View style={styles.checklist}>
          {CHECKLIST.map((item) => {
            const checked = checkedItems[item.id];
            return (
              <View key={item.id} style={styles.checkRow}>
                <View style={[styles.checkIcon, checked ? styles.checkIconDone : styles.checkIconPending]}>
                  <Text style={styles.checkIconText}>{checked ? '✓' : '○'}</Text>
                </View>
                <Text style={[styles.checkLabel, checked && styles.checkLabelDone]}>{item.label}</Text>
                {checked && <Text style={styles.checkBadge}>✓</Text>}
              </View>
            );
          })}
        </View>

        {/* Countdown overlay */}
        {countdown !== null && (
          <View style={styles.countdownOverlay}>
            <Animated.Text style={[styles.countdownNum, { transform: [{ scale: countdownAnim }], color: exercise.accentColor }]}>
              {countdown}
            </Animated.Text>
          </View>
        )}

        {/* CTA */}
        {isReady && countdown === null && (
          <NeonButton
            title="I'm Ready — Start Workout"
            onPress={handleStartCountdown}
            variant="primary"
          />
        )}

        {!isReady && (
          <View style={styles.detectingRow}>
            <View style={styles.detectingDot} />
            <Text style={styles.detectingText}>Detecting your position…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  cameraPlaceholder: { flex: 1 },
  silhouetteArea: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    width: 220,
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: { position: 'absolute', left: 0, right: 0, alignSelf: 'stretch' },
  corner: { position: 'absolute' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  backText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  exerciseBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  exerciseBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  directionBadge: {
    position: 'absolute', top: 110, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.cyanGlow,
  },
  directionText: { color: Colors.cyan, fontSize: 13, fontWeight: '600' },
  bottomPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24 },
  panelTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },
  checklist: { gap: 10, marginBottom: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  checkIconDone: { backgroundColor: Colors.successDim },
  checkIconPending: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  checkIconText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  checkLabel: { flex: 1, fontSize: 14, color: Colors.textMuted },
  checkLabelDone: { color: Colors.textPrimary },
  checkBadge: { fontSize: 12, color: Colors.success },
  countdownOverlay: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  countdownNum: { fontSize: 80, fontWeight: '900', letterSpacing: -2 },
  detectingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 16 },
  detectingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.cyan, opacity: 0.7 },
  detectingText: { color: Colors.textMuted, fontSize: 14 },
});
