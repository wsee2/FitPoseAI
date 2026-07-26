import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
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
import { todayMYTDateStr } from '../utils/mytDate';
import { useApp } from '../context/AppContext';
type Props = {
  navigation: { goBack: () => void; canGoBack: () => boolean };
  route: { params?: { exerciseId?: ExerciseId } | undefined };
};

// ---------------------------------------------------------------------------
// Analysis constants
const SAMPLE_INTERVAL_MS = 500;  // 2 fps — adequate for all 5 exercises
const MAX_FRAMES         = 120;  // cap at 60 seconds of video
const MOVENET_INPUT_SIZE = 192;

// Body-visibility check — mirrors WorkoutScreen calibration (ankles excluded;
// they clip at frame edges and are the least reliable keypoint).
const VALIDITY_REQUIRED_KPS   = [0, 5, 6, 11, 12, 13, 14]; // nose, shoulders, hips, knees
// Slightly lower than the live threshold (0.2): video is offline so we can be
// more permissive; helps with subjects that are small or in dim lighting.
const VALIDITY_CONF_THRESHOLD = 0.15;
const VALIDITY_FRAME_MARGIN   = 0.04;

// Usable-segment detection — samples ALL frames, then finds the longest
// continuous block of valid frames.  Isolated bad frames (momentary occlusions,
// pose noise) are absorbed up to SEGMENT_BAD_TOLERANCE before the segment breaks.
//
// SEGMENT_BAD_TOLERANCE — consecutive invalid frames allowed inside a segment.
//   ↑ Increase if brief pose losses (arm crossing body) split the segment.
//   ↓ Decrease if unrelated objects / background people extend segments.
const SEGMENT_BAD_TOLERANCE       = 3;
//
// MIN_USABLE_SEGMENT_MS — minimum duration of the longest valid segment.
//   Reject if the body is never fully visible for at least this long.
//   ↑ Increase to require more exercise footage (e.g. 8000 for 8 s).
//   ↓ Decrease to accept very short demonstration clips.
const MIN_USABLE_SEGMENT_MS       = 5_000;
//
// MIN_USABLE_SEGMENT_FRACTION — usable segment must be at least this fraction
//   of the total video duration.  Set to 0 to disable (rely only on the
//   absolute minimum above).
//   ↑ Raise if you want to reject videos where the person is only briefly visible.
//   ↓ Lower if long-video users consistently have short usable windows.
const MIN_USABLE_SEGMENT_FRACTION = 0.30;

// Set false to silence per-frame keypoint logs (keep true during tuning).
const DEBUG_VIDEO_ANALYSIS = true;

// How many times to feed each video frame into the FSM before moving to the next.
// The live camera FSMs use a SMOOTH_WINDOW=5 buffer designed for ~30 fps (≈167 ms/frame).
// At SAMPLE_INTERVAL_MS=500 ms each video frame represents ~16 camera frames, so
// repeating the FSM update that many times fills the buffer with the current angle
// rather than blending it with angles from different parts of the rep cycle.
const VIDEO_FSM_REPS = Math.ceil(SAMPLE_INTERVAL_MS / 33);

// ---------------------------------------------------------------------------
interface AnalysisResult {
  reps: number;        // rep count, or hold seconds for plank
  score: number;       // 0–100 (same convention as live mode)
  topFeedback: string[];
  segmentMs: number;   // duration of the analyzed usable segment
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

/**
 * Returns the start/end FRAME INDICES (inclusive) of the longest contiguous run
 * of valid frames.  Up to `badTolerance` consecutive invalid frames are absorbed
 * into the segment so brief pose losses do not split it.
 * Returns { start: 0, end: -1 } when no valid frame exists.
 */
function findLongestSegment(
  valid: boolean[],
  badTolerance: number,
): { start: number; end: number } {
  let bestStart = 0;
  let bestEnd   = -1;
  let curStart  = -1;
  let lastValidIdx   = -1;
  let consecutiveBad = 0;

  const tryCommit = () => {
    if (curStart !== -1 && lastValidIdx >= curStart) {
      if (lastValidIdx - curStart > bestEnd - bestStart) {
        bestStart = curStart;
        bestEnd   = lastValidIdx;
      }
    }
  };

  for (let i = 0; i < valid.length; i++) {
    if (valid[i]) {
      if (curStart === -1) curStart = i;
      consecutiveBad = 0;
      lastValidIdx   = i;
    } else if (curStart !== -1) {
      consecutiveBad++;
      if (consecutiveBad > badTolerance) {
        tryCommit();
        curStart       = -1;
        lastValidIdx   = -1;
        consecutiveBad = 0;
      }
    }
  }
  tryCommit(); // flush any open segment at end of array
  return { start: bestStart, end: bestEnd };
}

/** Extract one video frame, letterbox-pad + resize to 192×192, run MoveNet, return 51 keypoints or null. */
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
    const thumbW = thumb.width;
    const thumbH = thumb.height;

    // 2. Resize preserving aspect ratio (longer edge → 192), no cropping and no stretch.
    // A center-crop (matching the live pipeline's square crop) would discard real content —
    // whenever the subject fills more of the frame (e.g. moving closer/lower to squat),
    // their feet get cropped out entirely, starving the FSM of ankle keypoints for the rest
    // of the clip. Letterbox padding (below) keeps 100% of the frame, and a uniform-scale
    // resize introduces no aspect distortion, so no post-hoc angle correction is needed.
    const contentW = thumbH >= thumbW ? Math.round((MOVENET_INPUT_SIZE * thumbW) / thumbH) : MOVENET_INPUT_SIZE;
    const contentH = thumbH >= thumbW ? MOVENET_INPUT_SIZE : Math.round((MOVENET_INPUT_SIZE * thumbH) / thumbW);
    const manip = await ImageManipulator.manipulateAsync(
      frameUri,
      [{ resize: { width: contentW, height: contentH } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 },
    );
    resizedUri = manip.uri;

    // 3. Read the resized JPEG as base64.
    const base64 = await FileSystem.readAsStringAsync(resizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 4. base64 → Uint8Array (atob is a global in RN 0.76+).
    const binary = atob(base64);
    const jpegBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      jpegBytes[i] = binary.charCodeAt(i);
    }

    // 5. JPEG → RGBA pixels (jpeg-js pure JS, fast for this size).
    const { data: rgba } = jpeg.decode(jpegBytes, { useTArray: true });

    // 6. Paste into a black 192×192 canvas, centered — the actual letterbox/pillarbox pad.
    const rgb = new Uint8Array(MOVENET_INPUT_SIZE * MOVENET_INPUT_SIZE * 3);
    const padX = Math.floor((MOVENET_INPUT_SIZE - contentW) / 2);
    const padY = Math.floor((MOVENET_INPUT_SIZE - contentH) / 2);
    for (let row = 0; row < contentH; row++) {
      const srcRowStart = row * contentW;
      const dstRowStart = (row + padY) * MOVENET_INPUT_SIZE + padX;
      for (let col = 0; col < contentW; col++) {
        const srcP = (srcRowStart + col) * 4;
        const dstP = (dstRowStart + col) * 3;
        rgb[dstP]     = rgba[srcP]!;
        rgb[dstP + 1] = rgba[srcP + 1]!;
        rgb[dstP + 2] = rgba[srcP + 2]!;
      }
    }

    // 7. Run MoveNet on JS thread (runSync is safe here; each call is ~20–50 ms).
    const outputs = model.runSync([rgb.buffer]);
    const out = new Float32Array(outputs[0]!);
    return Array.from(out);
  } catch (err) {
    console.warn('[VA] frame extraction error @' + timeMs + 'ms:', err);
    return null;
  } finally {
    // Clean up temp files regardless of outcome.
    if (frameUri)   FileSystem.deleteAsync(frameUri,   { idempotent: true }).catch(() => {});
    if (resizedUri) FileSystem.deleteAsync(resizedUri, { idempotent: true }).catch(() => {});
  }
}

/**
 * Process the video: extract all frames (pass 1), find the longest contiguous
 * segment where the body is fully visible, then run the exercise FSM on that
 * segment only (pass 2).  Setup/teardown frames at the start/end of the video
 * are automatically excluded.
 */
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

  if (DEBUG_VIDEO_ANALYSIS) {
    console.log(`[VA] starting: ${totalFrames} frames, uri scheme=${videoUri.substring(0, videoUri.indexOf('://') + 3)}`);
  }

  // ── PASS 1: extract frames & run MoveNet (the slow part — I/O bound) ──────
  const frameKps: (number[] | null)[] = [];
  let maxNoseConf = 0; // tracks whether anyone was ever detected (for error messages)

  for (let i = 0; i < totalFrames; i++) {
    await new Promise<void>(r => setTimeout(r, 0)); // yield so progress bar updates
    onProgress((i + 0.5) / totalFrames * 0.85);     // progress: 0 → 85 %

    const kp = await runMoveNetOnVideoFrame(model, videoUri, i * SAMPLE_INTERVAL_MS);
    frameKps.push(kp);

    if (kp) {
      const noseConf = kp[2] ?? 0; // keypoint 0: [y, x, conf] at indices [0,1,2]
      if (noseConf > maxNoseConf) maxNoseConf = noseConf;

      if (DEBUG_VIDEO_ANALYSIS) {
        const badKps = VALIDITY_REQUIRED_KPS.filter(j => {
          const conf = kp[j * 3 + 2] ?? 0;
          const y    = kp[j * 3]     ?? 0;
          const x    = kp[j * 3 + 1] ?? 0;
          return !(
            conf >= VALIDITY_CONF_THRESHOLD &&
            y >= VALIDITY_FRAME_MARGIN && y <= 1 - VALIDITY_FRAME_MARGIN &&
            x >= VALIDITY_FRAME_MARGIN && x <= 1 - VALIDITY_FRAME_MARGIN
          );
        });
        console.log(
          `[VA] f${i} @${i * SAMPLE_INTERVAL_MS}ms` +
          ` valid=${badKps.length === 0}` +
          ` nose=${noseConf.toFixed(2)}` +
          (badKps.length > 0
            ? ` badKps=[${badKps.map(j => `${j}:${(kp[j*3+2]??0).toFixed(2)}`).join(',')}]`
            : ''),
        );
      }
    } else if (DEBUG_VIDEO_ANALYSIS) {
      console.log(`[VA] f${i} @${i * SAMPLE_INTERVAL_MS}ms null (extraction failed)`);
    }
  }

  // If every frame returned null, the video file itself could not be decoded —
  // this is an EXTRACTION failure, not a pose-estimation or visibility failure.
  // Surface it explicitly so the UI never shows a misleading "No person detected".
  if (frameKps.every(kp => kp === null)) {
    if (DEBUG_VIDEO_ANALYSIS) console.log('[VA] REJECT: EXTRACTION_FAILED (0 frames decoded)');
    throw new Error('EXTRACTION_FAILED');
  }

  // ── Find longest contiguous valid segment ─────────────────────────────────
  const validFlags = frameKps.map(kp => kp != null && checkBodyVisible(kp));
  const { start: segStart, end: segEnd } = findLongestSegment(validFlags, SEGMENT_BAD_TOLERANCE);

  // segEnd = -1 when no valid frame was found
  const segmentMs = segEnd >= segStart
    ? (segEnd - segStart + 1) * SAMPLE_INTERVAL_MS
    : 0;

  if (DEBUG_VIDEO_ANALYSIS) {
    const validCount = validFlags.filter(Boolean).length;
    console.log(
      `[VA] segment: f${segStart}–f${segEnd}` +
      ` (${segStart * SAMPLE_INTERVAL_MS}–${segEnd * SAMPLE_INTERVAL_MS}ms, ${segmentMs}ms)` +
      ` validFrames=${validCount}/${totalFrames}` +
      ` fraction=${(segmentMs / durationMs).toFixed(2)}`,
    );
  }

  // ── Acceptance check ──────────────────────────────────────────────────────
  const fractionOk =
    MIN_USABLE_SEGMENT_FRACTION <= 0 ||
    segmentMs / durationMs >= MIN_USABLE_SEGMENT_FRACTION;

  if (segmentMs < MIN_USABLE_SEGMENT_MS || !fractionOk) {
    // Classify the rejection cause so the UI can show an actionable message.
    const reason =
      maxNoseConf < 0.15 ? 'NO_PERSON'         : // no detectable person in the video
      segmentMs   === 0  ? 'BODY_PARTIAL'       : // person present but body never fully in frame
                           'SEGMENT_TOO_SHORT';   // visible segment too short
    if (DEBUG_VIDEO_ANALYSIS) {
      console.log(`[VA] REJECT: ${reason} (maxNose=${maxNoseConf.toFixed(2)} segMs=${segmentMs})`);
    }
    throw new Error(reason);
  }

  if (DEBUG_VIDEO_ANALYSIS) {
    console.log(`[VA] ACCEPT: analyzing f${segStart}–f${segEnd} (${segmentMs}ms)`);
  }

  // ── PASS 2: run exercise FSM on the usable segment only ───────────────────
  // This pass is very fast (pure computation, no I/O); it completes in < 1 s.
  const fsm: SquatFsm | PushupFsm | LungeFsm | PlankFsm | SitupFsm =
    exerciseId === 'squat'  ? new SquatFsm()  :
    exerciseId === 'pushup' ? new PushupFsm() :
    exerciseId === 'lunge'  ? new LungeFsm()  :
    exerciseId === 'plank'  ? new PlankFsm()  :
    new SitupFsm();

  let lastState: any = null;
  const feedbackCounts: Record<string, number> = {};
  let goodPlankFrames = 0;

  const segLen = segEnd - segStart + 1;
  for (let i = segStart; i <= segEnd; i++) {
    await new Promise<void>(r => setTimeout(r, 0));
    onProgress(0.85 + (i - segStart + 1) / segLen * 0.15); // 85 → 100 %

    const kp = frameKps[i];
    if (!kp) continue; // bad frame absorbed within tolerance — skip FSM update

    if (DEBUG_VIDEO_ANALYSIS && exerciseId === 'squat') {
      const names = ['nose', 'L_sh', 'R_sh', 'L_hip', 'R_hip', 'L_knee', 'R_knee', 'L_ankle', 'R_ankle'];
      const idxs  = [0, 5, 6, 11, 12, 13, 14, 15, 16];
      const confs = idxs.map((k, n) => `${names[n]}=${(kp[k * 3 + 2] ?? 0).toFixed(2)}`).join(' ');
      console.log(`[VA-FSM] f${i} @${i * SAMPLE_INTERVAL_MS}ms preState=${(lastState as any)?.stage ?? 'null'} ${confs}`);
    }

    // Feed the FSM VIDEO_FSM_REPS times per video frame.
    // Each FSM has a SMOOTH_WINDOW=5 rolling buffer sized for ~30 fps live camera
    // (5 × 33 ms ≈ 167 ms).  At SAMPLE_INTERVAL_MS=500 ms each video frame
    // represents ~16 camera frames, so a single FSM call would blend the current
    // angle with angles from adjacent rep-cycle phases, masking peaks.
    // Repeating the call fills the buffer with the current frame's angle only.
    for (let r = 0; r < VIDEO_FSM_REPS; r++) {
      lastState = fsm.update(kp);
    }

    if (DEBUG_VIDEO_ANALYSIS && exerciseId === 'squat') {
      const s = lastState as any;
      console.log(`[VA-FSM] f${i} → stage=${s.stage} counter=${s.counter} angle=${s.kneeAngle?.toFixed(1)} feedback="${s.feedback}"`);
    }

    // Plank: count frames in hold × sample interval (FSM uses Date.now() internally,
    // so holdSeconds would track processing time, not video time).
    if (exerciseId === 'plank' && (lastState as any).isHolding) goodPlankFrames++;

    // Accumulate form feedback (skip generic cues).
    const fb: string | undefined = lastState?.feedback;
    if (fb && fb !== 'Get ready' && fb !== 'Hold the plank' && fb !== 'Go Down') {
      feedbackCounts[fb] = (feedbackCounts[fb] ?? 0) + 1;
    }
  }

  onProgress(1);
  if (!lastState) throw new Error('NO_FRAMES_PROCESSED');

  // ── Final metrics — match live-mode conventions exactly ───────────────────
  let reps: number;
  let score: number;
  if (exerciseId === 'plank') {
    reps  = Math.round(goodPlankFrames * (SAMPLE_INTERVAL_MS / 1000));
    score = reps;
  } else {
    reps  = (lastState as any).counter ?? 0;
    score = Math.min(100, (lastState as any).score ?? 0);
  }

  const topFeedback = Object.entries(feedbackCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([msg]) => msg);

  return { reps, score, topFeedback, segmentMs };
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
  // Tracks a video file we copied to local cache (needs cleanup when done).
  const localCopyUriRef = useRef<string | null>(null);

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
      // 'videos' string literal (not the deprecated MediaTypeOptions enum).
      mediaTypes: 'videos' as ImagePicker.MediaType,
      allowsEditing: false,
      quality: 1,
    });

    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];

    // Discard any previously cached local copy.
    if (localCopyUriRef.current) {
      FileSystem.deleteAsync(localCopyUriRef.current, { idempotent: true }).catch(() => {});
      localCopyUriRef.current = null;
    }

    // On Android, expo-image-picker returns content:// URIs (Android Photo Picker /
    // MediaStore).  expo-video-thumbnails' MediaMetadataRetriever fails to open a
    // file descriptor for those URIs from inside its Dispatchers.IO coroutine —
    // openFileDescriptor() returns null or throws SecurityException, leaving the
    // retriever without a data source, so every getFrameAtTime() call returns null.
    // Copying to the local cache gives a file:// path that always works.
    let resolvedUri = asset.uri;
    if (Platform.OS === 'android' && asset.uri.startsWith('content://')) {
      try {
        const ext = (asset.mimeType ?? '').toLowerCase().includes('quicktime') ? 'mov' : 'mp4';
        const dest = `${FileSystem.cacheDirectory}va_input.${ext}`;
        await FileSystem.copyAsync({ from: asset.uri, to: dest });
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists && (info as { exists: true; size: number }).size > 0) {
          localCopyUriRef.current = dest;
          resolvedUri = dest;
          console.log('[VA] copied content:// to local cache:', dest,
            `(${(info as { exists: true; size: number }).size} bytes)`);
        } else {
          console.warn('[VA] copy produced empty/missing file — using content:// directly');
        }
      } catch (copyErr) {
        console.warn('[VA] content:// → local copy failed — using content:// directly:', copyErr);
        // content:// URI is now handled by setDataSource(context, uri) in native module.
      }
    }

    setSelectedVideo({
      uri: resolvedUri,
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
      const msg = err?.message;
      setErrorMsg(
        msg === 'EXTRACTION_FAILED'
          ? "Couldn't read this video — make sure it's a standard MP4 or MOV file and try again."
          : msg === 'NO_PERSON'
          ? "No person detected — make sure you're in frame and the area is well lit."
          : msg === 'BODY_PARTIAL'
          ? "Your whole body wasn't visible. Move further back so your head, shoulders, hips, and knees are all in frame."
          : msg === 'SEGMENT_TOO_SHORT'
          ? "Not enough usable footage — record a longer clip with your full body visible throughout."
          : 'Analysis failed. Please try a different video (MP4 or MOV, portrait mode).',
      );
      setPhase('error');
    }
  }, [selectedVideo, model, selectedExercise, updateProgress]);

  const saveToHistory = useCallback(() => {
    if (!result || !selectedVideo || savedToHistory) return;
    const exercise = EXERCISES[selectedExercise];
    const session: WorkoutSession = {
      id: Date.now().toString(),
      exerciseId: selectedExercise,
      date: todayMYTDateStr(),
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
    // Clean up local video copy when the user discards this video.
    if (localCopyUriRef.current) {
      FileSystem.deleteAsync(localCopyUriRef.current, { idempotent: true }).catch(() => {});
      localCopyUriRef.current = null;
    }
    setPhase('idle');
    setResult(null);
    setSavedToHistory(false);
    setErrorMsg('');
    updateProgress(0);
  }, [updateProgress]);

  const exercise = EXERCISES[selectedExercise];
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

          {/* Segment note */}
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              📹 Analyzed {Math.round(result.segmentMs / 1000)}s of usable footage at 2 fps · Portrait mode
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
