import * as Speech from 'expo-speech';

// Ported exactly from the PC prototype's anti-spam timing logic. Exposed as named
// constants so they can be tuned without hunting through logic.
export const AUDIO_INTERVAL = 3;         // min seconds between ANY two spoken messages
export const AUDIO_REPEAT_INTERVAL = 8;  // min seconds before the SAME message repeats

let lastSpoken = '';
let lastAudioTime = 0;
let enabled = true;

/**
 * Speak `feedback` if the anti-spam gate allows it:
 *   - at least AUDIO_INTERVAL seconds since last speech, AND
 *   - either the text changed OR AUDIO_REPEAT_INTERVAL has elapsed.
 *
 * Queue-stacking is prevented purely by the timing gate: feedback strings are
 * ≤2 s at rate 1.0, well within the 3 s floor, so a new speak() is never issued
 * while the previous one is still running.
 */
export function speakFeedback(feedback: string): void {
  if (!enabled || !feedback) return;
  const now = Date.now() / 1000;
  const timeSinceAudio = now - lastAudioTime;
  if (timeSinceAudio >= AUDIO_INTERVAL) {
    if (feedback !== lastSpoken || timeSinceAudio >= AUDIO_REPEAT_INTERVAL) {
      Speech.speak(feedback, { rate: 1.0 });
      lastSpoken = feedback;
      lastAudioTime = now;
    }
  }
}

/**
 * Speak immediately, bypassing the anti-spam gate.
 * Use for critical cues like countdown numbers where timing must be exact.
 * Updates internal timing state so the gate honours this call for subsequent feedback.
 */
export function speakImmediate(text: string): void {
  if (!enabled || !text) return;
  Speech.speak(text, { rate: 1.1 });
  lastSpoken = text;
  lastAudioTime = Date.now() / 1000;
}

/** Call on exercise change / session start so stale "last spoken" state doesn't carry over. */
export function reset(): void {
  lastSpoken = '';
  lastAudioTime = 0;
}

/** Honour the "Voice Coaching" toggle in Settings. Stops any in-progress speech when disabled. */
export function setEnabled(v: boolean): void {
  enabled = v;
  if (!v) Speech.stop();
}
