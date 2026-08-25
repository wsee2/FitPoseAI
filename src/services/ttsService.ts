import * as Speech from 'expo-speech';
import type { VoiceType } from '../context/AppContext';

// Ported exactly from the PC prototype's anti-spam timing logic. Exposed as named
// constants so they can be tuned without hunting through logic.
export const AUDIO_INTERVAL = 3;         // min seconds between ANY two spoken messages
export const AUDIO_REPEAT_INTERVAL = 8;  // min seconds before the SAME message repeats

// Pitch/rate fallback, used only when no distinct male/female OS voice could be resolved on
// this device (see resolveVoices below) — a last resort so the setting still audibly does
// SOMETHING rather than nothing, not the primary mechanism.
const FALLBACK_PROFILES: Record<VoiceType, { pitch: number; rate: number }> = {
  male:   { pitch: 0.8, rate: 1.0 },
  female: { pitch: 1.3, rate: 1.0 },
};

// expo-speech's Voice type exposes no gender field, so matching real installed voices to
// male/female is a name/identifier heuristic — but it's what actually changes the TIMBRE
// heard, unlike pitch-shifting the single default voice (which just makes the same voice
// higher/lower, not male-sounding vs female-sounding). Covers the common built-in English
// voices on iOS (AVSpeechSynthesizer) and the identifiers/names various Android TTS engines
// use; not guaranteed on every device, hence the pitch/rate fallback above.
const FEMALE_HINTS = [
  'female', 'samantha', 'karen', 'moira', 'tessa', 'victoria', 'fiona', 'susan',
  'ava', 'allison', 'nicky', 'zoe', 'kate', 'serena', 'catherine', 'siri female',
];
const MALE_HINTS = [
  'male', 'alex', 'daniel', 'fred', 'oliver', 'arthur', 'aaron', 'tom', 'gordon',
  'rishi', 'albert', 'siri male',
];

let lastSpoken = '';
let lastAudioTime = 0;
let enabled = true;
let currentVoice: VoiceType = 'male';

/** Called whenever the user's chosen Voice Type (Settings) loads or changes. */
export function setVoiceProfile(voice: VoiceType): void {
  currentVoice = voice;
}

let resolvedVoices: { male: string | null; female: string | null } | null = null;
let resolvingPromise: Promise<void> | null = null;

function matchesHints(voice: Speech.Voice, hints: string[]): boolean {
  const haystack = `${voice.identifier} ${voice.name}`.toLowerCase();
  return hints.some((h) => haystack.includes(h));
}

async function resolveVoices(): Promise<void> {
  if (resolvedVoices) return;
  if (!resolvingPromise) {
    resolvingPromise = (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const english = voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
        resolvedVoices = {
          male: english.find((v) => matchesHints(v, MALE_HINTS))?.identifier ?? null,
          female: english.find((v) => matchesHints(v, FEMALE_HINTS))?.identifier ?? null,
        };
      } catch {
        resolvedVoices = { male: null, female: null };
      }
    })();
  }
  await resolvingPromise;
}
// Kick off resolution as soon as this module loads, so it's normally ready well before the
// first real speak() call (calibration's "Hold still" needs camera permission + model load
// first, which takes far longer than this).
resolveVoices();

/** Builds the Speech.speak() options for the current voice profile. rateBoost nudges rate up
 *  for urgent cues (see speakImmediate) without needing a second profile table. */
function buildSpeechOptions(rateBoost: number): Speech.SpeechOptions {
  const voiceId = resolvedVoices?.[currentVoice];
  if (voiceId) {
    // A real distinct voice was found — use its own natural timbre/pitch, only nudging rate.
    return { voice: voiceId, rate: 1.0 + rateBoost };
  }
  // No distinct voice for this gender on this device — fall back to pitch-shifting the
  // default voice, which is audible but not a genuine timbre change.
  const fallback = FALLBACK_PROFILES[currentVoice];
  return { pitch: fallback.pitch, rate: fallback.rate + rateBoost };
}

/**
 * Speak `feedback` if the anti-spam gate allows it:
 *   - at least AUDIO_INTERVAL seconds since last speech, AND
 *   - either the text changed OR AUDIO_REPEAT_INTERVAL has elapsed.
 *
 * Queue-stacking is prevented purely by the timing gate: feedback strings are
 * ≤2 s at rate 1.0, well within the 3 s floor, so a new speak() is never issued
 * while the previous one is still running.
 *
 * Returns whether it actually spoke — callers that offer a one-shot message (e.g.
 * encouragementService's milestone queue) need this to know whether to consume it or leave
 * it queued for a later, ungated frame; existing callers that ignore the return value are
 * unaffected.
 */
export function speakFeedback(feedback: string): boolean {
  if (!enabled || !feedback) return false;
  const now = Date.now() / 1000;
  const timeSinceAudio = now - lastAudioTime;
  if (timeSinceAudio >= AUDIO_INTERVAL) {
    if (feedback !== lastSpoken || timeSinceAudio >= AUDIO_REPEAT_INTERVAL) {
      Speech.speak(feedback, buildSpeechOptions(0));
      lastSpoken = feedback;
      lastAudioTime = now;
      return true;
    }
  }
  return false;
}

/**
 * Speak immediately, bypassing the anti-spam gate.
 * Use for critical cues like countdown numbers where timing must be exact.
 * Updates internal timing state so the gate honours this call for subsequent feedback.
 */
export function speakImmediate(text: string): void {
  if (!enabled || !text) return;
  Speech.speak(text, buildSpeechOptions(0.1)); // +0.1 preserves the original urgency bump over speakFeedback
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
