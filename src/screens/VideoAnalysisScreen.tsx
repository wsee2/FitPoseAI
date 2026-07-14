import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as jpeg from 'jpeg-js';
import type { TensorflowModel } from 'react-native-fast-tflite';
import { loadMoveNetModel } from '../services/moveNet';
import { SquatFsm } from '../services/fsm/squatFsm';
import { PushupFsm } from '../services/fsm/pushupFsm';
import { LungeFsm } from '../services/fsm/lungeFsm';
import { PlankFsm } from '../services/fsm/plankFsm';
import { SitupFsm } from '../services/fsm/situpFsm';
import { Colors, BorderRadius } from '../theme';
import { ExerciseIcon } from '../components/ui/ExerciseIcon';
import { NeonButton } from '../components/ui/NeonButton';
import { ProgressRing } from '../components/ui/ProgressRing';
import { EXERCISES, type ExerciseId, type WorkoutSession } from '../data/exercises';
import { useApp } from '../context/AppContext';
type Props = {
  navigation: { goBack: () => void; canGoBack: () => boolean };
  route: { params?: { exerciseId?: ExerciseId } | undefined };
};

// ---------------------------------------------------------------------------
// Analysis constants
const SAMPLE_INTERVAL_MS = 500; // 2 fps equivalent — adequate for all 5 exercises
const MAX_FRAMES = 120;         // cap at 60 seconds of video
const MOVENET_INPUT_SIZE = 192;

// Mirror the calibration check from WorkoutScreen (not exported from there).
const VALIDITY_REQUIRED_KPS = [0, 5, 6, 11, 12, 13, 14]; // nose, shoulders, hips, knees
const VALIDITY_CONF_THRESHOLD = 0.2;
const VALIDITY_FRAME_MARGIN = 0.04;
const VALIDITY_CHECK_FRAMES = 10;  // first N frames checked for body visibility
const VALIDITY_MIN_RATIO = 0.5;    // at least 50% must show the full body

// ---------------------------------------------------------------------------
interface AnalysisResult {
  reps: number;        // rep count, or hold seconds for plank
  score: number;       // 0–100 (same convention as live mode)
  topFeedback: string[];
}

interface SelectedVideo {
  uri: string;
  durationMs: number;
  fileName: string;
}

type Phase = 'idle' | 'analyzing' | 'done' | 'error';

const EXERCISE_LIST = Object.values(EXERCISES);

// ---------------------------------------------------------------------------
// Core analysis helpers (pure functions, no React)

function checkBodyVisible(kp: number[]): boolean {
  return VALIDITY_REQUIRED_KPS.every((i) => {
    const conf = kp[i * 3 + 2] ?? 0;
    const y    = kp[i * 3]     ?? 0;
    const x    = kp[i * 3 + 1] ?? 0;
    return (
      conf >= VALIDITY_CONF_THRESHOLD &&
      y >= VALIDITY_FRAME_MARGIN && y <= 1 - VALIDITY_FRAME_MARGIN &&
      x >= VALIDITY_FRAME_MARGIN && x <= 1 - VALIDITY_FRAME_MARGIN
    );
  });
}

/** Extract one video frame, resize to 192×192, run MoveNet, return 51 keypoints or null. */
async function runMoveNetOnVideoFrame(
  model: TensorflowModel,
  videoUri: string,
  timeMs: number,
): Promise<number[] | null> {
  let frameUri: string | null = null;
  let resizedUri: string | null = null;
  try {
    // 1. Native JPEG thumbnail at video's native resolution.
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: timeMs,
      quality: 0.8,
    });
    frameUri = thumb.uri;

    // 2. Resize to 192×192 before decoding — avoids decoding a full-resolution JPEG in JS.
    const manip = await ImageManipulator.manipulateAsync(
      frameUri,
      [{ resize: { width: MOVENET_INPUT_SIZE, height: MOVENET_INPUT_SIZE } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 },
    );
    resizedUri = manip.uri;

    // 3. Read 192×192 JPEG as base64 (~5–15 KB).
    const base64 = await FileSystem.readAsStringAsync(resizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 4. base64 → Uint8Array (atob is a global in RN 0.76+).
    const binary = atob(base64);
    const jpegBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      jpegBytes[i] = binary.charCodeAt(i);
    }

    // 5. JPEG → RGBA pixels (jpeg-js pure JS, fast for 192×192).
    const { data: rgba } = jpeg.decode(jpegBytes, { useTArray: true });

    // 6. RGBA → RGB (MoveNet expects rgb uint8).
    const rgb = new Uint8Array(MOVENET_INPUT_SIZE * MOVENET_INPUT_SIZE * 3);
    for (let p = 0; p < MOVENET_INPUT_SIZE * MOVENET_INPUT_SIZE; p++) {
      rgb[p * 3]     = rgba[p * 4]!;
      rgb[p * 3 + 1] = rgba[p * 4 + 1]!;
      rgb[p * 3 + 2] = rgba[p * 4 + 2]!;
    }

    // 7. Run MoveNet on JS thread (runSync is safe here; each call is ~20–50 ms).
    const outputs = model.runSync([rgb.buffer]);
    const out = new Float32Array(outputs[0]!);
    return Array.from(out);
  } catch {
    return null;
  } finally {
    // Clean up temp files regardless of outcome.
    if (frameUri)  FileSystem.deleteAsync(frameUri,  { idempotent: true }).catch(() => {});
    if (resizedUri) FileSystem.deleteAsync(resizedUri, { idempotent: true }).catch(() => {});
  }
}

/** Process the video: extract frames, run MoveNet + FSM, return AnalysisResult. */
async function analyzeVideo(
  model: TensorflowModel,
  videoUri: string,
  durationMs: number,
  exerciseId: ExerciseId,
  onProgress: (ratio: number) => void,
): Promise<AnalysisResult> {
  const totalFrames = Math.min(
    Math.max(Math.floor(durationMs / SAMPLE_INTERVAL_MS), 1),
    MAX_FRAMES,
  );

  // Fresh FSM instance — no state from any prior session.
  const fsm: SquatFsm | PushupFsm | LungeFsm | PlankFsm | SitupFsm =
    exerciseId === 'squat'  ? new SquatFsm()  :
    exerciseId === 'pushup' ? new PushupFsm() :
    exerciseId === 'lunge'  ? new LungeFsm()  :
    exerciseId === 'plank'  ? new PlankFsm()  :
    new SitupFsm();

  let lastState: any = null;
  const feedbackCounts: Record<string, number> = {};
  let validBodyFrames = 0;
  let checkedFrames = 0;
  let goodPlankFrames = 0; // for plank: count frames in hold (PlankFsm uses wall clock, not video time)

  for (let i = 0; i < totalFrames; i++) {
    // Yield to the event loop so the progress bar can re-render between frames.
    await new Promise<void>(r => setTimeout(r, 0));
    onProgress(i / totalFrames);

    const kp = await runMoveNetOnVideoFrame(model, videoUri, i * SAMPLE_INTERVAL_MS);
    if (!kp) continue;

    // Validity check: only on the first VALIDITY_CHECK_FRAMES frames.
    if (i < VALIDITY_CHECK_FRAMES) {
      checkedFrames++;
      if (checkBodyVisible(kp)) validBodyFrames++;
    }

    // FSM update — portrait orientation → identity transform (same as live portrait mode).
    lastState = fsm.update(kp);

    // Plank hold tracking: use frame count × sample interval, not FSM's holdSeconds
    // (FSM uses Date.now() which tracks processing time, not video time).
    if (exerciseId === 'plank' && (lastState as any).isHolding) goodPlankFrames++;

    // Accumulate form feedback (skip generic cues).
    const fb: string | undefined = lastState?.feedback;
    if (fb && fb !== 'Get ready' && fb !== 'Hold the plank' && fb !== 'Go Down') {
      feedbackCounts[fb] = (feedbackCounts[fb] ?? 0) + 1;
    }
  }

  onProgress(1);

  // Reject if body was not adequately visible.
  if (checkedFrames === 0 || validBodyFrames / checkedFrames < VALIDITY_MIN_RATIO) {
    throw new Error('BODY_NOT_VISIBLE');
  }
  if (!lastState) throw new Error('NO_FRAMES_PROCESSED');

  // Final metrics — match live-mode conventions exactly.
  let reps: number;
  let score: number;
  if (exerciseId === 'plank') {
    reps  = Math.round(goodPlankFrames * (SAMPLE_INTERVAL_MS / 1000));
    score = reps; // live mode: score = holdSeconds
  } else {
    reps  = (lastState as any).counter ?? 0;
    score = Math.min(100, (lastState as any).score ?? 0);
  }

  // Top-3 form issues by frequency.
  const topFeedback = Object.entries(feedbackCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([msg]) => msg);

  return { reps, score, topFeedback };
}

// ---------------------------------------------------------------------------
// Component

export default function VideoAnalysisScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { addWorkoutSession } = useApp();

  const [selectedExercise, setSelectedExercise] = useState<ExerciseId>(
    route.params?.exerciseId ?? 'squat',
  );
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedToHistory, setSavedToHistory] = useState(false);

  const progressBarWidth = useRef(new Animated.Value(0)).current;

  // Load model on mount (singleton — won't re-download if already loaded by WorkoutScreen).
  useEffect(() => {
    loadMoveNetModel()
      .then(setModel)
      .catch(err => console.warn('[VideoAnalysis] model load failed:', err));
  }, []);

  const updateProgress = useCallback((ratio: number) => {
    setProgress(ratio);
    Animated.timing(progressBarWidth, {
      toValue: ratio,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [progressBarWidth]);

  const pickVideo = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg('Gallery access is required. Please grant permission in Settings.');
      setPhase('error');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
    });

    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setSelectedVideo({
      uri: asset.uri,
      durationMs: asset.duration ?? 60_000,
      fileName: asset.fileName ?? 'video',
    });
    setResult(null);
    setSavedToHistory(false);
    setPhase('idle');
  }, []);

  const startAnalysis = useCallback(async () => {
    if (!selectedVideo || !model) return;

    setPhase('analyzing');
    updateProgress(0);
    setSavedToHistory(false);

    try {
      const res = await analyzeVideo(
        model,
        selectedVideo.uri,
        selectedVideo.durationMs,
        selectedExercise,
        updateProgress,
      );
      setResult(res);
      setPhase('done');
    } catch (err: any) {
      if (err?.message === 'BODY_NOT_VISIBLE') {
        setErrorMsg(
          'Body not fully visible — less than half the sampled frames showed your head, shoulders, hips, and knees. Please record your whole body in frame and try again.',
        );
      } else {
        setErrorMsg(
          'Analysis failed. Please try a different video. Make sure it is a standard MP4/MOV recorded in portrait mode.',
        );
      }
      setPhase('error');
    }
  }, [selectedVideo, model, selectedExercise, updateProgress]);

  const saveToHistory = useCallback(() => {
    if (!result || !selectedVideo || savedToHistory) return;
    const exercise = EXERCISES[selectedExercise];
    const session: WorkoutSession = {
      id: Date.now().toString(),
      exerciseId: selectedExercise,
      date: new Date().toISOString().split('T')[0],
      reps: result.reps,
      duration: Math.round(Math.min(selectedVideo.durationMs, MAX_FRAMES * SAMPLE_INTERVAL_MS) / 1000),
      score: result.score,
      calories: Math.round(result.reps * exercise.calories),
      formQuality: result.score >= 90 ? 'Excellent' : result.score >= 75 ? 'Good' : result.score >= 60 ? 'Fair' : 'Needs Work',
      source: 'video',
    };
    addWorkoutSession(session);
    setSavedToHistory(true);
  }, [result, selectedVideo, selectedExercise, addWorkoutSession, savedToHistory]);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setSavedToHistory(false);
    setErrorMsg('');
    updateProgress(0);
  }, [updateProgress]);

  const exercise = EXERCISES[selectedExercise];
  const analyzedSeconds = Math.min(
    Math.round((selectedVideo?.durationMs ?? 0) / 1000),
    MAX_FRAMES * SAMPLE_INTERVAL_MS / 1000,
  );
  const canAnalyze = !!selectedVideo && !!model && phase === 'idle';

  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
        <Text style={styles.headerTitle}>Analyze Video</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* ANALYZING phase — full-screen progress                             */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'analyzing' && (
        <View style={styles.centeredFill}>
          <Text style={styles.analyzeEmoji}>🔍</Text>
          <Text style={styles.analyzeTitle}>Analyzing…</Text>
          <Text style={styles.analyzeSubtitle}>
            Running pose estimation on {Math.round(progress * 100)}% of frames
          </Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressBarWidth.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: exercise.accentColor,
                },
              ]}
            />
          </View>

          <Text style={styles.analyzeNote}>
            This may take 10–30 seconds depending on video length.
          </Text>
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ERROR phase                                                         */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'error' && (
        <View style={styles.centeredFill}>
          <Text style={styles.analyzeEmoji}>⚠️</Text>
          <Text style={styles.analyzeTitle}>Analysis Failed</Text>
          <View style={styles.errorCard}>
            <Text style={styles.errorMsg}>{errorMsg}</Text>
          </View>
          <NeonButton
            title="Try Another Video"
            onPress={resetToIdle}
            variant="secondary"
            style={styles.actionBtn}
          />
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* DONE phase — results                                                */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'done' && result && (
        <ScrollView
          contentContainerStyle={[styles.resultScroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Score + exercise header */}
          <View style={styles.resultHeader}>
            <View style={[styles.resultIconBox, { backgroundColor: `${exercise.accentColor}18` }]}>
              <ExerciseIcon exerciseId={selectedExercise} size={36} color={exercise.accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultExName, { color: exercise.accentColor }]}>{exercise.name}</Text>
              <Text style={styles.resultSubtitle}>Video Analysis Complete</Text>
            </View>
          </View>

          {/* Score ring + reps side by side */}
          <View style={styles.metricsRow}>
            <ProgressRing
              progress={Math.min(result.score, 100)}
              size={130}
              strokeWidth={11}
              color={exercise.accentColor}
              label={result.score.toString()}
              sublabel="score"
              animated
            />

            <View style={styles.repMetric}>
              <Text style={[styles.repNum, { color: exercise.accentColor }]}>{result.reps}</Text>
              <Text style={styles.repLabel}>
                {selectedExercise === 'plank' ? 'seconds held' : 'reps counted'}
              </Text>
              <View style={[styles.qualityBadge, { borderColor: `${exercise.accentColor}40`, backgroundColor: `${exercise.accentColor}12` }]}>
                <Text style={[styles.qualityText, { color: exercise.accentColor }]}>
                  {result.score >= 90 ? 'Excellent' : result.score >= 75 ? 'Good' : result.score >= 60 ? 'Fair' : 'Needs Work'}
                </Text>
              </View>
            </View>
          </View>

          {/* Top form issues */}
          {result.topFeedback.length > 0 && (
            <View style={styles.feedbackCard}>
              <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.feedbackGrad}>
                <Text style={styles.feedbackTitle}>Form Notes</Text>
                {result.topFeedback.map((fb, i) => (
                  <View key={i} style={styles.feedbackRow}>
                    <View style={[styles.feedbackDot, { backgroundColor: i === 0 ? Colors.orange : Colors.textMuted }]} />
                    <Text style={styles.feedbackText}>{fb}</Text>
                  </View>
                ))}
              </LinearGradient>
            </View>
          )}

          {result.topFeedback.length === 0 && (
            <View style={styles.feedbackCard}>
              <LinearGradient colors={['#0D1A0D', '#091209']} style={styles.feedbackGrad}>
                <Text style={styles.feedbackTitle}>Form Notes</Text>
                <Text style={styles.feedbackText}>No major form issues detected — great work!</Text>
              </LinearGradient>
            </View>
          )}

          {/* Plank note */}
          {selectedExercise === 'plank' && (
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                ⚡ Plank hold time is estimated from sampled frames (±1 second accuracy).
              </Text>
            </View>
          )}

          {/* Portrait mode note */}
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              📹 Analyzed {analyzedSeconds}s at 2 fps · Portrait mode · No overlay playback
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {!savedToHistory ? (
              <NeonButton
                title="Save to History"
                onPress={saveToHistory}
                variant="primary"
                style={{ flex: 1 }}
              />
            ) : (
              <View style={[styles.savedBadge, { flex: 1 }]}>
                <Text style={styles.savedText}>✓ Saved to History</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={resetToIdle} style={styles.analyzeAnotherBtn}>
            <Text style={styles.analyzeAnotherText}>Analyze Another Video</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* IDLE phase — exercise selector + video picker                       */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'idle' && (
        <ScrollView
          contentContainerStyle={[styles.idleScroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Exercise picker */}
          <Text style={styles.sectionLabel}>Exercise in the video</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.exerciseChipsRow}
          >
            {EXERCISE_LIST.map((ex) => {
              const active = selectedExercise === ex.id;
              return (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => setSelectedExercise(ex.id)}
                  style={[
                    styles.exerciseChip,
                    active && { borderColor: ex.accentColor, backgroundColor: `${ex.accentColor}18` },
                  ]}
                >
                  <ExerciseIcon
                    exerciseId={ex.id}
                    size={18}
                    color={active ? ex.accentColor : Colors.textMuted}
                  />
                  <Text style={[styles.exerciseChipText, active && { color: ex.accentColor }]}>
                    {ex.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Video picker */}
          <Text style={styles.sectionLabel}>Video</Text>
          <TouchableOpacity onPress={pickVideo} activeOpacity={0.8} style={styles.pickerCard}>
            <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.pickerCardGrad}>
              {selectedVideo ? (
                <View style={styles.pickerSelected}>
                  <Text style={styles.pickerSelectedIcon}>🎬</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerFileName} numberOfLines={1}>{selectedVideo.fileName}</Text>
                    <Text style={styles.pickerDuration}>
                      {Math.round(selectedVideo.durationMs / 1000)}s
                      {selectedVideo.durationMs > MAX_FRAMES * SAMPLE_INTERVAL_MS
                        ? ` · first ${MAX_FRAMES * SAMPLE_INTERVAL_MS / 1000}s will be analyzed`
                        : ''}
                    </Text>
                  </View>
                  <Text style={[styles.changeText, { color: exercise.accentColor }]}>Change</Text>
                </View>
              ) : (
                <View style={styles.pickerEmpty}>
                  <View style={[styles.pickerIconBox, { backgroundColor: `${exercise.accentColor}18` }]}>
                    <Text style={styles.pickerIcon}>📁</Text>
                  </View>
                  <Text style={styles.pickerTitle}>Choose Video from Gallery</Text>
                  <Text style={styles.pickerSub}>MP4 or MOV · any length</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Portrait mode guidance */}
          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>💡</Text>
            <Text style={styles.tipText}>
              Film in <Text style={{ color: exercise.accentColor, fontWeight: '700' }}>portrait mode</Text> with your full body visible — head, shoulders, hips, and knees must be in frame.
            </Text>
          </View>

          {/* Model loading indicator */}
          {!model && (
            <View style={styles.modelLoadingRow}>
              <Text style={styles.modelLoadingText}>⏳ Loading pose model…</Text>
            </View>
          )}

          {/* Start button */}
          <NeonButton
            title={model ? 'Start Analysis' : 'Loading model…'}
            onPress={startAnalysis}
            variant="primary"
            style={[styles.actionBtn, !canAnalyze && { opacity: 0.45 }]}
          />
          {!canAnalyze && selectedVideo && model && (
            <Text style={styles.hintText}>Select a video above to continue</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  backBtn:     { padding: 8 },
  backText:    { color: Colors.cyan, fontSize: 17, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

  // Shared centred container for analyzing / error states
  centeredFill: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },

  // Analyzing
  analyzeEmoji:    { fontSize: 52, marginBottom: 16 },
  analyzeTitle:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  analyzeSubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 24 },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: Colors.border,
    borderRadius: 4, overflow: 'hidden', marginBottom: 16,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  analyzeNote:  { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  // Error
  errorCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: 16, marginVertical: 16, alignSelf: 'stretch',
  },
  errorMsg:  { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center' },

  // Idle
  idleScroll: { paddingHorizontal: 20, paddingTop: 8 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12, marginTop: 8,
  },
  exerciseChipsRow: { gap: 10, paddingBottom: 20 },
  exerciseChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  exerciseChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },

  pickerCard: {
    borderRadius: BorderRadius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  pickerCardGrad: { padding: 20 },
  pickerEmpty: { alignItems: 'center', gap: 10 },
  pickerIconBox: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerIcon:  { fontSize: 28 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  pickerSub:   { fontSize: 13, color: Colors.textMuted },
  pickerSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  pickerSelectedIcon: { fontSize: 28 },
  pickerFileName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  pickerDuration:  { fontSize: 12, color: Colors.textMuted },
  changeText:      { fontSize: 13, fontWeight: '600' },

  tipCard: {
    flexDirection: 'row', gap: 10, padding: 14,
    backgroundColor: Colors.goldDim, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.orangeGlow, marginBottom: 24,
  },
  tipIcon: { fontSize: 16 },
  tipText: { fontSize: 13, color: Colors.gold, lineHeight: 18, flex: 1 },

  modelLoadingRow: { alignItems: 'center', marginBottom: 12 },
  modelLoadingText: { fontSize: 13, color: Colors.textMuted },

  actionBtn:  { marginBottom: 8 },
  hintText:   { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },

  // Results
  resultScroll: { paddingHorizontal: 20, paddingTop: 8 },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 24, paddingTop: 8,
  },
  resultIconBox: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  resultExName:   { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  resultSubtitle: { fontSize: 13, color: Colors.textMuted },

  metricsRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 24, marginBottom: 20,
  },
  repMetric: { flex: 1, alignItems: 'center' },
  repNum:    { fontSize: 56, fontWeight: '900', letterSpacing: -1 },
  repLabel:  { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
  qualityBadge: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  qualityText: { fontSize: 12, fontWeight: '700' },

  feedbackCard: {
    borderRadius: BorderRadius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  feedbackGrad:  { padding: 18 },
  feedbackTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
  feedbackRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  feedbackDot:   { width: 7, height: 7, borderRadius: 3.5 },
  feedbackText:  { fontSize: 14, color: Colors.textSecondary, flex: 1, lineHeight: 18 },

  noteCard: {
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10,
  },
  noteText:  { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },

  actionRow:          { marginTop: 8, marginBottom: 10 },
  savedBadge: {
    height: 52, borderRadius: BorderRadius.full, borderWidth: 1,
    borderColor: Colors.success, backgroundColor: 'rgba(0,255,136,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  savedText:  { fontSize: 15, fontWeight: '700', color: Colors.success },
  analyzeAnotherBtn: {
    height: 48, alignItems: 'center', justifyContent: 'center',
  },
  analyzeAnotherText: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
});
