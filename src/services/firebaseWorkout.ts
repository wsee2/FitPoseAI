import { ref, push, get } from 'firebase/database';
import { database, auth } from './firebaseConfig';
import type { WorkoutSession } from '../data/exercises';

/** Saves a completed WorkoutSession under the signed-in user's node. No-op if not signed in. */
export async function saveSession(session: WorkoutSession): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await push(ref(database, `users/${uid}/sessions`), session);
  } catch (err) {
    console.warn('saveSession failed:', err);
  }
}

/** Loads all WorkoutSessions for a user, sorted newest-first. */
export async function loadSessions(uid: string): Promise<WorkoutSession[]> {
  try {
    const snap = await get(ref(database, `users/${uid}/sessions`));
    if (!snap.exists()) return [];
    // Sort by `id` (Date.now().toString() at session creation — see WorkoutScreen/AppContext),
    // not by `date` alone: `date` is a "YYYY-MM-DD" day, so two sessions on the same day used
    // to tie under a date-only comparator, leaving their relative order to depend on
    // incidental object-key iteration order rather than an explicit time comparison. `id` is
    // an exact millisecond timestamp, so this sorts correctly both across days and within one.
    return (Object.values(snap.val() as Record<string, WorkoutSession>) as WorkoutSession[]).sort(
      (a, b) => Number(b.id) - Number(a.id)
    );
  } catch (err) {
    console.warn('loadSessions failed:', err);
    return [];
  }
}
