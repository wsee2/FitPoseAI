// Central "demo mode" switch. Flip both to false before a demo/presentation for a clean
// console + screen and the best available performance — this removes the per-frame
// string-building + console.log cost entirely (not just throttles it down), and hides the
// on-screen perf overlay. Neither flag touches any counting/detection/rendering logic.
export const DEBUG_LOGS = false;
export const PERF_HUD_ENABLED = true;

// Per-frame debug logs (WorkoutScreen's [POSE] log, each exercise FSM's own [SQUAT]/
// [PUSHUP]/[PLANK]/[LUNGE]/[SITUP] log) fire at most this often, instead of on every
// processed frame (16-28x/sec). That per-frame string-building + console.log cost was adding
// real JS-thread congestion, delaying how promptly the thread was free to handle the NEXT
// frame's keypoints (see WorkoutScreen.tsx's updateKeypoints) — this throttles the logging
// only; every FSM still runs its actual counting/detection logic on every single frame,
// completely unaffected.
export const DEBUG_LOG_INTERVAL_MS = 200;

// Shared bucket used by the 5 exercise FSMs (squat/pushup/lunge/plank/situp) — safe because
// exactly one of them runs per processed frame (WorkoutScreen's switch on exerciseId), so
// there's never a same-frame double-call that could suppress a log that should have fired.
let lastFsmLogAt = 0;
export function shouldLogFsmFrame(): boolean {
  const now = Date.now();
  if (now - lastFsmLogAt < DEBUG_LOG_INTERVAL_MS) return false;
  lastFsmLogAt = now;
  return true;
}
