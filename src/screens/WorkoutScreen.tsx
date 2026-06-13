import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors, BorderRadius } from '../theme';
import { EXERCISES } from '../data/exercises';
import { useApp } from '../context/AppContext';
import { getPoseHtml } from '../poseHtml';
import type { HomeStackParamList } from '../navigation/types';

const { width, height } = Dimensions.get('window');
type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
  route: RouteProp<HomeStackParamList, 'Workout'>;
};

interface WorkoutStats {
  reps: number;
  score: number;
  feedback: string;
  formQuality: string;
}

export default function WorkoutScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const exercise = EXERCISES[exerciseId];
  const insets = useSafeAreaInsets();
  const { startWorkout, stopWorkout, addWorkoutSession } = useApp();

  const [html, setHtml] = useState('');
  const [assetsReady, setAssetsReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState<WorkoutStats>({ reps: 0, score: 0, feedback: 'Get ready!', formQuality: 'Good' });

  const webViewRef = useRef<WebView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repAnim = useRef(new Animated.Value(1)).current;
  const feedbackOpacity = useRef(new Animated.Value(1)).current;
  const startTimeRef = useRef(Date.now());

  // Load assets and build HTML
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        const imageModules = {
          SQUAT: require('../../assets/Squat.png'),
          PUSHUP: require('../../assets/Push-Up.png'),
          LUNGE: require('../../assets/Lunge.png'),
          PLANK: require('../../assets/Plank.png'),
          SITUP: require('../../assets/Sit-Up.png'),
        } as const;
        type ImageKey = keyof typeof imageModules;
        const assetMap: Record<ImageKey, string> = { SQUAT: '', PUSHUP: '', LUNGE: '', PLANK: '', SITUP: '' };
        for (const key of Object.keys(imageModules) as ImageKey[]) {
          const asset = Asset.fromModule(imageModules[key]);
          await asset.downloadAsync();
          const uri = asset.localUri ?? asset.uri;
          const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
          assetMap[key] = `data:image/png;base64,${b64}`;
        }
        setHtml(getPoseHtml(assetMap));
        setAssetsReady(true);
      } catch (e) {
        console.warn('Asset load error', e);
        setAssetsReady(true);
      }
    })();
  }, []);

  // Timer
  useEffect(() => {
    startWorkout(exerciseId);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (!isPaused) setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isPaused && timerRef.current) clearInterval(timerRef.current);
    else if (!isPaused) {
      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPaused]);

  // Animate rep counter on change
  useEffect(() => {
    Animated.sequence([
      Animated.spring(repAnim, { toValue: 1.3, useNativeDriver: true, tension: 400, friction: 8 }),
      Animated.spring(repAnim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }),
    ]).start();
  }, [stats.reps]);

  // Animate feedback changes
  const updateFeedback = (text: string) => {
    Animated.sequence([
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setStats(prev => ({ ...prev, feedback: text }));
  };

  // WebView message handler
  const handleWebViewMessage = useCallback((e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'rep') {
        setStats(prev => ({ ...prev, reps: data.count ?? prev.reps, score: data.score ?? prev.score }));
      } else if (data.type === 'feedback') {
        updateFeedback(data.message);
      } else if (data.type === 'formQuality') {
        setStats(prev => ({ ...prev, formQuality: data.quality }));
      } else if (data.type === 'done') {
        handleStop(data.reps, data.score);
      }
    } catch {}
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStop = (finalReps?: number, finalScore?: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const session = stopWorkout();
    const toSave = session ?? {
      id: Date.now().toString(),
      exerciseId,
      date: new Date().toISOString().split('T')[0],
      reps: finalReps ?? stats.reps,
      duration: elapsed,
      score: finalScore ?? stats.score,
      calories: Math.round((finalReps ?? stats.reps) * (exercise.calories)),
      formQuality: stats.score >= 90 ? 'Excellent' : stats.score >= 75 ? 'Good' : stats.score >= 60 ? 'Fair' : 'Needs Work' as any,
    };
    addWorkoutSession(toSave);
    navigation.replace('SessionSummary', { sessionId: toSave.id });
  };

  const getFeedbackColor = (feedback: string): string => {
    if (feedback.includes('Good') || feedback.includes('Perfect') || feedback.includes('Great')) return Colors.success;
    if (feedback.includes('!') || feedback.includes('Push')) return Colors.orange;
    return Colors.textSecondary;
  };

  const scoreColor = stats.score >= 80 ? Colors.success : stats.score >= 60 ? Colors.warning : Colors.error;

  return (
    <View style={styles.container}>
      {/* WebView */}
      {assetsReady && html ? (
        <WebView
          ref={webViewRef}
          style={styles.webView}
          source={{ html, baseUrl: 'https://expo.dev' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          mixedContentMode="always"
          onMessage={handleWebViewMessage}
          onError={(e) => console.warn('WebView error', e.nativeEvent)}
        />
      ) : (
        <View style={[styles.webView, styles.loadingOverlay]}>
          <LinearGradient colors={['#050510', '#0A0A1A']} style={StyleSheet.absoluteFill} />
          <ActivityIndicator size="large" color={exercise.accentColor} />
          <Text style={[styles.loadingText, { color: exercise.accentColor }]}>Initializing AI…</Text>
        </View>
      )}

      {/* Top HUD */}
      <View style={[styles.topHUD, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => handleStop()} style={styles.stopBtn}>
          <LinearGradient colors={['rgba(255,77,79,0.3)', 'rgba(255,77,79,0.15)']} style={styles.hudBtn}>
            <Text style={styles.stopIcon}>✕</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Timer */}
        <View style={styles.timerPill}>
          <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)']} style={styles.timerGrad}>
            <View style={[styles.timerDot, { backgroundColor: isPaused ? Colors.warning : Colors.success }]} />
            <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
          </LinearGradient>
        </View>

        {/* Score */}
        <TouchableOpacity onPress={() => setIsPaused(!isPaused)} style={styles.scorePill}>
          <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)']} style={styles.timerGrad}>
            <Text style={[styles.scoreText, { color: scoreColor }]}>{stats.score}</Text>
            <Text style={styles.scoreLabel}>pts</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Exercise name badge */}
      <View style={styles.exerciseBadge}>
        <View style={[styles.exerciseBadgeInner, { borderColor: `${exercise.accentColor}60` }]}>
          <Text style={[styles.exerciseBadgeText, { color: exercise.accentColor }]}>{exercise.name.toUpperCase()}</Text>
        </View>
      </View>

      {/* Rep counter overlay */}
      <View style={styles.repCounter}>
        <Animated.Text style={[styles.repNum, { transform: [{ scale: repAnim }], color: exercise.accentColor }]}>
          {stats.reps}
        </Animated.Text>
        <Text style={styles.repLabel}>{exercise.duration ? 'sets' : 'reps'}</Text>
      </View>

      {/* Feedback chip */}
      <Animated.View style={[styles.feedbackChip, { opacity: feedbackOpacity }]}>
        <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.7)']} style={styles.feedbackGrad}>
          <View style={[styles.feedbackDot, { backgroundColor: getFeedbackColor(stats.feedback) }]} />
          <Text style={[styles.feedbackText, { color: getFeedbackColor(stats.feedback) }]}>
            {stats.feedback}
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* Bottom controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          onPress={() => setIsPaused(!isPaused)}
          style={styles.pauseBtn}
        >
          <LinearGradient
            colors={isPaused ? ['rgba(0,229,255,0.25)', 'rgba(0,229,255,0.1)'] : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
            style={styles.pauseBtnGrad}
          >
            <Text style={styles.pauseIcon}>{isPaused ? '▶' : '⏸'}</Text>
            <Text style={styles.pauseLabel}>{isPaused ? 'Resume' : 'Pause'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleStop()} style={styles.finishBtn}>
          <LinearGradient colors={[Colors.cyan, '#0066FF']} style={styles.finishGrad}>
            <Text style={styles.finishText}>Finish</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Pause overlay */}
      {isPaused && (
        <View style={styles.pauseOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />
          <View style={styles.pauseContent}>
            <Text style={styles.pausedTitle}>Paused</Text>
            <Text style={styles.pausedSub}>Take a breath · Resume when ready</Text>
            <TouchableOpacity onPress={() => setIsPaused(false)} style={styles.resumeBtn}>
              <LinearGradient colors={[Colors.cyan, '#0066FF']} style={styles.resumeGrad}>
                <Text style={styles.resumeText}>▶  Resume</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webView: { flex: 1 },
  loadingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  topHUD: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  hudBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,77,79,0.4)' },
  stopBtn: { borderRadius: 22 },
  stopIcon: { color: Colors.error, fontSize: 16, fontWeight: '700' },
  timerPill: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  timerGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  timerDot: { width: 7, height: 7, borderRadius: 3.5 },
  timerText: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  scorePill: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  scoreText: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  scoreLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginLeft: 2 },
  exerciseBadge: { position: 'absolute', top: 110, alignSelf: 'center' },
  exerciseBadgeInner: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  exerciseBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  repCounter: {
    position: 'absolute',
    bottom: 180,
    alignSelf: 'center',
    alignItems: 'center',
  },
  repNum: { fontSize: 88, fontWeight: '900', letterSpacing: -4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  repLabel: { fontSize: 16, color: Colors.textMuted, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginTop: -12 },
  feedbackChip: { position: 'absolute', bottom: 150, alignSelf: 'center', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  feedbackGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, gap: 8 },
  feedbackDot: { width: 7, height: 7, borderRadius: 3.5 },
  feedbackText: { fontSize: 14, fontWeight: '700' },
  bottomControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', paddingHorizontal: 20, gap: 12, paddingTop: 12,
  },
  pauseBtn: { flex: 1, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pauseBtnGrad: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pauseIcon: { fontSize: 14, color: Colors.textPrimary },
  pauseLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  finishBtn: { flex: 1, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  finishGrad: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.lg },
  finishText: { fontSize: 15, fontWeight: '800', color: Colors.textInverse },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pauseContent: { alignItems: 'center', gap: 12 },
  pausedTitle: { fontSize: 42, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1 },
  pausedSub: { fontSize: 15, color: Colors.textMuted },
  resumeBtn: { borderRadius: BorderRadius.full, overflow: 'hidden', marginTop: 16 },
  resumeGrad: { paddingHorizontal: 36, paddingVertical: 16, borderRadius: BorderRadius.full },
  resumeText: { fontSize: 17, fontWeight: '800', color: Colors.textInverse },
});
