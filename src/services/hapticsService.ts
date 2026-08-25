import * as Haptics from 'expo-haptics';

let enabled = true;

/** Honour the "Haptic Feedback" toggle in Settings. */
export function setEnabled(v: boolean): void {
  enabled = v;
}

/** Fires on a completed rep (squat/lunge/push-up/sit-up) or a plank hold starting/resuming. */
export function pulseRep(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
