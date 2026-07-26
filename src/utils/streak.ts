import type { WorkoutSession } from '../data/exercises';
import { todayInMYT, mytDateStr } from './mytDate';

/**
 * Current streak = consecutive Malaysia calendar days with at least one session,
 * counting back from today. If there's no session yet today, the streak is still
 * "alive" as long as yesterday has one (today isn't over yet); otherwise it's 0.
 */
export function computeStreak(sessions: WorkoutSession[]): number {
  const dates = new Set(sessions.map(s => s.date));
  const cursor = todayInMYT();
  if (!dates.has(mytDateStr(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  while (dates.has(mytDateStr(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
