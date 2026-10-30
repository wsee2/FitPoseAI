import type { WorkoutSession } from '../data/exercises';
import type { ExperienceLevel, FitnessGoal } from '../context/AppContext';

// ---------------------------------------------------------------------------
// Provider configuration — to swap back to Gemini: replace callLLM() + createChatSession()
// internals only. Everything else (rate limiting, retry, prompts, exports) stays identical.
const MODEL_NAME = 'gpt-5-mini';
// Human-readable label for the AI Coach screen header. DERIVED from MODEL_NAME rather than
// written out again, because the hardcoded copy went stale the moment the model was swapped
// (the header still read "GPT-4o Mini" long after the move to gpt-5-mini). Format matches the
// old label exactly: 'gpt-5-mini' → 'GPT-5 Mini', 'gpt-4o-mini' → 'GPT-4o Mini'.
export const MODEL_DISPLAY_NAME = (() => {
  const [family, version, ...rest] = MODEL_NAME.split('-');
  const head = version ? `${family.toUpperCase()}-${version}` : family.toUpperCase();
  return [head, ...rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1))].join(' ');
})();
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const OPENAI_API_BASE = 'https://api.openai.com/v1';

// Logged on every Metro start — key presence is safe to log; the value is never logged.
console.log('[aiCoach] init — key present:', !!OPENAI_API_KEY, '| provider: openai | model:', MODEL_NAME);

// ---------------------------------------------------------------------------
// System prompt — exported so it can be read, cited, and tuned without touching logic.
export const COACH_SYSTEM_PROMPT = `You are FitPose AI Coach — a supportive personal fitness trainer inside FitPose, a real-time posture-correction app that uses on-device computer vision to track 5 bodyweight exercises: squat, push-up, lunge, plank, and sit-up.

## YOUR ROLE
Help users exercise with better form, build consistency, and stay motivated. You have access to the user's recent workout history (provided in context) and should reference it specifically when relevant.

## WHAT YOU CAN DO
- Explain correct form, common mistakes, and how to fix them for any of the 5 supported exercises
- Give personalized feedback based on the user's tracked scores, reps, and trends
- Recommend what to train next and how to progress safely
- Create simple, structured weekly workout plans using the 5 supported exercises
- Motivate, encourage, and celebrate progress

## EXERCISE SCOPE — IMPORTANT
FitPose tracks exactly 5 exercises with real-time form feedback: **squat, push-up, lunge, plank, sit-up**.
When recommending exercises or writing workout plans:
1. **Prioritize these 5 first.** The user can perform them inside the app and receive tracked form feedback — that is where they get the most value.
2. **You may suggest other exercises** when genuinely helpful (for variety, a specific physical need, or a gap the 5 do not cover), but always label them clearly as outside the app, for example: "This one you'd do on your own, since FitPose doesn't track it yet: ..."
3. Keep non-tracked suggestions brief and secondary. Never build a plan that relies mostly on untracked exercises.

## HARD LIMITS — NEVER DO THESE
- **No medical advice.** You are not a doctor or physiotherapist. If the user mentions pain, injury, dizziness, numbness, or any medical concern — express care, strongly advise them to consult a qualified doctor or physiotherapist, and do NOT speculate on diagnosis or treatment. When recent messages suggest pain or injury in a specific area, be **extra conservative**: avoid recommending exercises that could aggravate that area, and keep reminding them to seek professional guidance before resuming training.
- **No restrictive nutrition advice.** Do not prescribe specific calorie targets, macros, or supplements. Brief, general encouragement to eat balanced whole foods is fine.
- **No live video.** You do NOT see the user's camera or live session. Real-time posture correction is handled by the app's on-device pose-detection engine. You explain, advise, and review — you do not watch them exercise.
- **No invented data.** Only reference workout stats explicitly provided in the context. If asked about data you do not have, say so clearly rather than guessing.
- **No off-topic deep dives.** If a user asks about topics clearly unrelated to fitness or wellbeing, acknowledge briefly and redirect back to exercise and training.

## TONE & WELLBEING
- Short and practical: 2–4 sentences per reply unless a structured workout plan is explicitly requested.
- Encouraging and direct — like a knowledgeable friend who happens to be a personal trainer.
- **Never shame or judge.** If a user expresses negative self-talk about their body or appearance (e.g. "my arms are fat", "I hate how I look") — respond with warmth and compassion. Focus on health, strength, and what the body can do — not how it looks. Gently clarify that targeted fat loss from a single body part ("spot reduction") is not how the body works, and that consistent full-body training is the most effective path forward. Do not speculate on the user's body composition or weight.
- Plain language — if a technical term is necessary, briefly explain it.

## GROUNDING
The user's recent workout history is provided below in context. Reference specific sessions, scores, or patterns you observe in that data to make feedback feel personal and earned. If history is not yet available, encourage the user to complete their first session.`;

// ---------------------------------------------------------------------------
// Chat message and session types.
// Gemini swap: replace ChatSession with Gemini's native chat object; update callLLM + createChatSession.
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatSession { history: ChatMessage[] }

// ---------------------------------------------------------------------------
// Current in-progress session — injected as extra context when the user chats mid-workout
// (via the WorkoutScreen tap-to-chat overlay). Never written to Firebase; exists only for
// the duration of the chat prompt, so today's not-yet-saved reps are still visible to the coach.
export interface CurrentSessionContext {
  exerciseName: string;
  progressLabel: string; // e.g. "6 reps so far" or "1:12 held so far"
  date: string; // today, Malaysia time (YYYY-MM-DD) — matches the format used in history summaries
}

function buildCurrentSessionNote(current: CurrentSessionContext): string {
  return `CURRENT SESSION IN PROGRESS RIGHT NOW (${current.date}) — NOT YET SAVED to the history above, the user paused mid-workout to chat with you. Exercise: ${current.exerciseName}. Progress so far: ${current.progressLabel}. If the user asks about "just now", "this session", or how they're doing right now, this is what they mean — treat it as separate from, and in addition to, the saved history above.`;
}

// ---------------------------------------------------------------------------
// Profile context — the user's stated goal and experience level (set at onboarding, editable
// in Settings), fed into every coach interaction so tone, technique depth, and suggestions
// actually reflect what the user told the app about themselves, per COACH_SYSTEM_PROMPT's
// own "personalized feedback" / "tailor your workout recommendations" promises.
export interface CoachProfileContext {
  goal: FitnessGoal;
  level: ExperienceLevel;
}

const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose_weight: 'losing weight / burning fat',
  build_muscle: 'building muscle and strength',
  improve_endurance: 'improving endurance and cardio stamina',
  flexibility: 'improving flexibility and range of motion',
};

const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'a beginner (new to working out)',
  intermediate: 'intermediate (some training experience)',
  advanced: 'advanced (experienced athlete)',
};

function buildProfileNote(profile: CoachProfileContext): string {
  return `USER PROFILE: Stated goal — ${GOAL_LABELS[profile.goal]}. Experience level — ${LEVEL_LABELS[profile.level]}. Let this shape your suggestions: for a beginner, favor simpler technique cues, easier rep/hold targets, and extra encouragement; for advanced, give more precise technique refinement and push for harder targets. Let the goal shape what you emphasize — e.g. rep-volume/cardio framing for endurance or weight-loss goals, controlled-tempo/strength framing for muscle-building, plank/lunge-heavy stretch-and-mobility framing for flexibility. Never invent workout data you don't have — this profile only informs tone and emphasis, not fabricated stats.`;
}

// ---------------------------------------------------------------------------
// Provider abstraction — swap ONLY this function (+ MODEL_NAME + OPENAI_API_KEY) to change provider.
async function callLLM(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    // gpt-5-mini is a reasoning-capable model (same family as o1/o3): the Chat Completions API
    // requires max_completion_tokens instead of max_tokens for these, and only accepts the
    // default temperature (1) — a custom value like the old 0.85 causes a 400. Omitting
    // temperature entirely uses that default rather than setting it explicitly.
    //
    // max_completion_tokens covers HIDDEN reasoning tokens + the visible reply combined — at
    // the original 400 (fine for non-reasoning gpt-4o-mini, where all of it was visible
    // output), gpt-5-mini could spend the whole budget on internal reasoning and return an
    // empty content string with a 200 OK (confirmed on-device: empty coach replies, no
    // error). Raised to 900 for headroom, and reasoning_effort: 'minimal' tells the model not
    // to reason heavily for what's meant to be a short, direct chat reply — this is the
    // GPT-5-family control for exactly this tradeoff, and also addresses the latency concern
    // flagged when this model was first chosen.
    body: JSON.stringify({
      model: MODEL_NAME, messages,
      max_completion_tokens: 900,
      reasoning_effort: 'minimal',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err: any = new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

// ---------------------------------------------------------------------------
// Retry helper — one retry with 2 s backoff for transient 5xx. Never retries 4xx.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err?.status != null && err.status >= 500 && err.status < 600) {
      await new Promise(r => setTimeout(r, 2000));
      return fn();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting — one proactive call per event key per cooldown window.
const lastFiredMs = new Map<string, number>();
const PROACTIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function canFire(key: string): boolean {
  const last = lastFiredMs.get(key) ?? 0;
  return Date.now() - last > PROACTIVE_COOLDOWN_MS;
}
function markFired(key: string): void {
  lastFiredMs.set(key, Date.now());
}

// ---------------------------------------------------------------------------
function buildHistorySummary(sessions: WorkoutSession[]): string {
  if (!sessions.length) return "No workout history yet — this is the user's first session.";
  return sessions
    .slice(0, 5)
    .map(s => {
      const metric = s.exerciseId === 'plank' ? `${s.reps}s hold` : `${s.reps} reps`;
      return `${s.date}: ${s.exerciseId} — ${metric}, score ${s.score}/100 (${s.formQuality}), ${s.duration}s`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
/**
 * Create a chat session seeded with the user's workout history.
 * Call once per AICoachScreen mount. Returns null if API key is missing.
 */
export function createChatSession(
  recentSessions: WorkoutSession[],
  currentSession?: CurrentSessionContext | null,
  profile?: CoachProfileContext | null
): ChatSession | null {
  if (!OPENAI_API_KEY) return null;
  const historySummary = buildHistorySummary(recentSessions);
  const history: ChatMessage[] = [
    { role: 'system', content: COACH_SYSTEM_PROMPT },
    { role: 'system', content: `USER'S RECENT WORKOUT HISTORY:\n${historySummary}` },
  ];
  if (profile) {
    history.push({ role: 'system', content: buildProfileNote(profile) });
  }
  if (currentSession) {
    history.push({ role: 'system', content: buildCurrentSessionNote(currentSession) });
  }
  return { history };
}

/**
 * Refreshes the coach's awareness of the current in-progress session on an existing chat
 * (e.g. the user closed the mid-workout chat, did more reps, then re-opened it). Appends a
 * fresh system note rather than recreating the session, so prior chat turns are preserved.
 */
export function updateCurrentSessionContext(
  chat: ChatSession | null,
  currentSession: CurrentSessionContext | null
): void {
  if (!chat || !currentSession) return;
  chat.history.push({ role: 'system', content: buildCurrentSessionNote(currentSession) });
}

/** Send one chat message and return the coach reply. Always returns a string (never throws). */
export async function sendChatMessage(chat: ChatSession | null, userMessage: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "I'm not available right now — OpenAI API key not configured. Add EXPO_PUBLIC_OPENAI_API_KEY to mobile/.env.local and restart Metro.";
  }
  if (!chat) return 'Chat session not initialized. Please close and reopen this screen.';

  // Append user turn; pop it on failure so history stays consistent and the message is retryable.
  chat.history.push({ role: 'user', content: userMessage });
  try {
    const reply = await withRetry(() => callLLM(chat.history));
    chat.history.push({ role: 'assistant', content: reply });
    return reply;
  } catch (err: any) {
    chat.history.pop();
    const rawMsg = String(err?.message ?? err);
    console.warn('[aiCoach] sendChatMessage RAW | status:', err?.status, '| msg:', rawMsg);
    try { console.warn('[aiCoach] sendChatMessage FULL:', JSON.stringify(err)); } catch {}
    if (err?.status === 503) return "The AI server is a bit busy right now — please try again in a moment.";
    if (err?.status === 429) return "I'm receiving too many requests — please try again in a moment!";
    if (err?.status === 401) return "API key issue — please check your OpenAI key configuration.";
    if (err?.status === 404) return 'The AI model is currently unavailable. Please try again in a moment.';
    if (rawMsg.includes('network') || rawMsg.includes('fetch'))
      return "Couldn't reach my server. Check your internet connection and try again.";
    return 'Something went wrong on my end. Try again in a moment.';
  }
}

/**
 * Generate a proactive coaching message for the session the user just finished.
 * Rate-limited to once per session (keyed by session.id). Call from JS thread only.
 */
export async function getSessionEndMessage(
  session: WorkoutSession,
  recentSessions: WorkoutSession[],
  profile?: CoachProfileContext | null
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const key = `session-end:${session.id}`;
  if (!canFire(key)) return null;
  markFired(key);

  const metric = session.exerciseId === 'plank'
    ? `${session.reps}s hold time`
    : `${session.reps} reps`;
  const pastSessions = recentSessions.filter(s => s.id !== session.id).slice(0, 3);
  const historyCtx = buildHistorySummary(pastSessions);

  const messages: ChatMessage[] = [
    { role: 'system', content: COACH_SYSTEM_PROMPT },
    ...(profile ? [{ role: 'system' as const, content: buildProfileNote(profile) }] : []),
    {
      role: 'user',
      content: `The user just completed: ${session.exerciseId} — ${metric}, score ${session.score}/100 (${session.formQuality}), duration ${session.duration}s.\nRecent history:\n${historyCtx}\n\nWrite ONE encouraging coaching message (2-3 sentences). Be specific to their score and reps. If score < 80, give one concrete improvement tip. Keep it SHORT and energetic.`,
    },
  ];

  try {
    return await withRetry(() => callLLM(messages));
  } catch (err: any) {
    console.warn('[aiCoach] getSessionEndMessage RAW | status:', err?.status, '| msg:', String(err?.message ?? err));
    try { console.warn('[aiCoach] getSessionEndMessage FULL:', JSON.stringify(err)); } catch {}
    return null;
  }
}

/**
 * Generate a proactive trend message based on the user's workout history.
 * Rate-limited to once per 24 hours. Call from JS thread only.
 */
export async function getTrendMessage(
  sessions: WorkoutSession[],
  profile?: CoachProfileContext | null
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  if (sessions.length < 2) return null;
  if (!canFire('trend')) return null;
  markFired('trend');

  const summary = buildHistorySummary(sessions);
  const messages: ChatMessage[] = [
    { role: 'system', content: COACH_SYSTEM_PROMPT },
    ...(profile ? [{ role: 'system' as const, content: buildProfileNote(profile) }] : []),
    {
      role: 'user',
      content: `Based on this user's recent workout history, write ONE brief proactive coaching observation (1-2 sentences). Look for clear trends: improving/declining scores, consistency, exercise variety, or form issues. Only mention a trend if clearly visible in the data. Be encouraging and actionable.\n\nHistory:\n${summary}`,
    },
  ];

  try {
    return await withRetry(() => callLLM(messages));
  } catch (err: any) {
    console.warn('[aiCoach] getTrendMessage RAW | status:', err?.status, '| msg:', String(err?.message ?? err));
    try { console.warn('[aiCoach] getTrendMessage FULL:', JSON.stringify(err)); } catch {}
    return null;
  }
}

/**
 * Generate a proactive congratulatory message when the user's experience level auto-upgrades
 * (see computeEligibleLevel in utils/experienceLevel.ts — driven by in-app training tenure,
 * not self-report). Rate-limited per target level so a render race can't double-fire it.
 * Call from JS thread only.
 */
export async function getLevelUpMessage(
  newLevel: ExperienceLevel,
  goal: FitnessGoal
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const key = `level-up:${newLevel}`;
  if (!canFire(key)) return null;
  markFired(key);

  const messages: ChatMessage[] = [
    { role: 'system', content: COACH_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `The user has just been automatically upgraded to **${LEVEL_LABELS[newLevel]}**, based on their sustained training history in this app (this is earned from real usage, not a self-report). Their stated goal is ${GOAL_LABELS[goal]}. Write ONE short, energetic congratulatory message (2-3 sentences) celebrating this milestone, and give one concrete way their training focus should shift now that they're at this level, tied to their goal.`,
    },
  ];

  try {
    return await withRetry(() => callLLM(messages));
  } catch (err: any) {
    console.warn('[aiCoach] getLevelUpMessage RAW | status:', err?.status, '| msg:', String(err?.message ?? err));
    try { console.warn('[aiCoach] getLevelUpMessage FULL:', JSON.stringify(err)); } catch {}
    return null;
  }
}
