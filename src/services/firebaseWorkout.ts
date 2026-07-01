import { ref, push, get } from 'firebase/database';
import { database } from './firebaseConfig';

export interface WorkoutRecord {
  exercise: string;
  reps: number;
  score: number;
  timestamp: string;
}

const WORKOUTS_PATH = 'workouts';

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Saves one workout record at session end. Offline-tolerant — never throws. */
export async function saveWorkout(exercise: string, reps: number, score: number): Promise<void> {
  try {
    const record: WorkoutRecord = {
      exercise: exercise.toUpperCase(),
      reps,
      score,
      timestamp: formatTimestamp(new Date()),
    };
    await push(ref(database, WORKOUTS_PATH), record);
  } catch (error) {
    console.warn('saveWorkout failed (offline?):', error);
  }
}

/** All workout records, sorted ascending by timestamp. Returns [] on failure (offline-tolerant). */
export async function getAllWorkouts(): Promise<WorkoutRecord[]> {
  try {
    const snapshot = await get(ref(database, WORKOUTS_PATH));
    if (!snapshot.exists()) return [];
    const records = Object.values(snapshot.val() as Record<string, WorkoutRecord>);
    return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch (error) {
    console.warn('getAllWorkouts failed (offline?):', error);
    return [];
  }
}

/** Last 5 workout records, ascending by timestamp. */
export async function getHistory(): Promise<WorkoutRecord[]> {
  const all = await getAllWorkouts();
  return all.slice(-5);
}
