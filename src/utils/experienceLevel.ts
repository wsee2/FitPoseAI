import type { WorkoutSession } from '../data/exercises';
import type { ExperienceLevel } from '../context/AppContext';
import { todayInMYT, parseMYTDateStr } from './mytDate';

const LEVEL_ORDER: Record<ExperienceLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** True if `a` is a strictly higher tier than `b` (beginner < intermediate < advanced). */
export function isHigherLevel(a: ExperienceLevel, b: ExperienceLevel): boolean {
  return LEVEL_ORDER[a] > LEVEL_ORDER[b];
}

// Auto-upgrade thresholds — measured from the user's earliest logged session IN THIS APP,
// never account-creation date, so it reflects actual in-app training tenure rather than how
// long ago they signed up. Each tier requires BOTH a minimum time span AND a minimum session
// count: time alone is trivially gamed (one workout, then months of inactivity, still
// "counts" as tenure), so pairing it with a session-count floor (~3x/week average sustained
// across the tier's duration) ensures the upgrade reflects genuine, sustained practice rather
// than calendar passage. Checked in descending order so the highest qualifying tier wins.
const UPGRADE_RULES: { level: ExperienceLevel; minDays: number; minSessions: number }[] = [
  { level: 'advanced', minDays: 120, minSessions: 40 },
  { level: 'intermediate', minDays: 30, minSessions: 12 },
];

/** Days elapsed (Malaysia calendar) since the user's earliest logged session. Null if none. */
export function daysSinceFirstWorkout(sessions: WorkoutSession[]): number | null {
  if (sessions.length === 0) return null;
  const earliestDate = sessions.reduce((min, s) => (s.date < min ? s.date : min), sessions[0].date);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((todayInMYT().getTime() - parseMYTDateStr(earliestDate).getTime()) / msPerDay);
}

/**
 * Highest ExperienceLevel the user's in-app history alone qualifies them for. Callers should
 * only ever use this to move a stored level UP (see isHigherLevel) — never to downgrade a
 * level the user set for themselves, whether at onboarding or later via Settings.
 */
export function computeEligibleLevel(sessions: WorkoutSession[]): ExperienceLevel {
  const days = daysSinceFirstWorkout(sessions);
  if (days == null) return 'beginner';
  const totalSessions = sessions.length;
  for (const rule of UPGRADE_RULES) {
    if (days >= rule.minDays && totalSessions >= rule.minSessions) return rule.level;
  }
  return 'beginner';
}
