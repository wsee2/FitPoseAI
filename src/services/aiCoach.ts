import { GoogleGenerativeAI } from '@google/generative-ai';
import type { WorkoutSession } from '../data/exercises';

const MODEL_NAME = 'gemini-2.0-flash';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const SYSTEM_PROMPT = `You are FitPose AI Coach, a personal fitness trainer for 5 bodyweight exercises: squats, push-ups, lunges, planks, and sit-ups.

Rules:
- Keep replies SHORT and PRACTICAL (2-4 sentences max, unless a workout plan is explicitly requested).
- Be encouraging, energetic, and direct — like a real personal trainer.
- You are NOT a medical professional. Do NOT diagnose injuries. For any pain, always advise consulting a doctor. Keep advice general and conservative.
- Do NOT invent workout data. Only reference data explicitly provided in the user's history context below.
- For workout plans: structure by day/week, keep it simple and achievable.`;

// Rate limiting: one proactive call per event key per cooldown window.
const lastFiredMs = new Map<string, number>();
const PROACTIVE_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes

function canFire(key: string): boolean {
  const last = lastFiredMs.get(key) ?? 0;
  return Date.now() - last > PROACTIVE_COOLDOWN_MS;
}
function markFired(key: string): void {
  lastFiredMs.set(key, Date.now());
}

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

/**
 * Create a Gemini multi-turn chat session seeded with the user's workout history.
 * Call once per AICoachScreen mount. Returns null if API key is missing.
 */
export function createChatSession(recentSessions: WorkoutSession[]): any {
  if (!genAI) return null;
  const historySummary = buildHistorySummary(recentSessions);
  const systemWithHistory = `${SYSTEM_PROMPT}\n\nUSER'S RECENT WORKOUT HISTORY:\n${historySummary}`;
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemWithHistory,
  });
  return model.startChat({
    generationConfig: { maxOutputTokens: 400, temperature: 0.85 },
  });
}

/** Send one chat message and return the coach reply. Always returns a string (never throws). */
export async function sendChatMessage(chat: any, userMessage: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return "I'm not available right now — Gemini API key not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to mobile/.env.local and restart Metro.";
  }
  if (!chat) return 'Chat session not initialized. Please close and reopen this screen.';
  try {
    const result = await chat.sendMessage(userMessage);
    return result.response.text().trim();
  } catch (err: any) {
    console.warn('[aiCoach] sendChatMessage error:', err?.status, err?.message);
    if (err?.status === 429) return "I'm receiving too many requests — try again in a moment!";
    if (err?.message?.includes('network') || err?.message?.includes('fetch'))
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
  recentSessions: WorkoutSession[]
): Promise<string | null> {
  if (!genAI || !GEMINI_API_KEY) return null;
  const key = `session-end:${session.id}`;
  if (!canFire(key)) return null;
  markFired(key);

  const metric = session.exerciseId === 'plank'
    ? `${session.reps}s hold time`
    : `${session.reps} reps`;
  const pastSessions = recentSessions.filter(s => s.id !== session.id).slice(0, 3);
  const historyCtx = buildHistorySummary(pastSessions);

  const prompt = `The user just completed: ${session.exerciseId} — ${metric}, score ${session.score}/100 (${session.formQuality}), duration ${session.duration}s.
Recent history:\n${historyCtx}

Write ONE encouraging coaching message (2-3 sentences). Be specific to their score and reps. If score < 80, give one concrete improvement tip. Keep it SHORT and energetic.`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: SYSTEM_PROMPT });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.warn('[aiCoach] getSessionEndMessage error:', err);
    return null;
  }
}

/**
 * Generate a proactive trend message based on the user's workout history.
 * Rate-limited to once per 20 minutes. Call from JS thread only.
 */
export async function getTrendMessage(sessions: WorkoutSession[]): Promise<string | null> {
  if (!genAI || !GEMINI_API_KEY) return null;
  if (sessions.length < 2) return null;
  if (!canFire('trend')) return null;
  markFired('trend');

  const summary = buildHistorySummary(sessions);
  const prompt = `Based on this user's recent workout history, write ONE brief proactive coaching observation (1-2 sentences). Look for clear trends: improving/declining scores, consistency, exercise variety, or form issues. Only mention a trend if clearly visible in the data. Be encouraging and actionable.\n\nHistory:\n${summary}`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: SYSTEM_PROMPT });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.warn('[aiCoach] getTrendMessage error:', err);
    return null;
  }
}
