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
    return (Object.values(snap.val() as Record<string, WorkoutSession>) as WorkoutSession[]).sort(
      (a, b) => (b.date ?? '').localeCompare(a.date ?? '')
    );
  } catch (err) {
    console.warn('loadSessions failed:', err);
    return [];
  }
}
