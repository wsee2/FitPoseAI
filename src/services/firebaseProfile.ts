import { ref, set, get, update } from 'firebase/database';
import { database } from './firebaseConfig';
import type { UserProfile } from '../context/AppContext';

export async function saveProfile(uid: string, profile: UserProfile): Promise<void> {
  try {
    await set(ref(database, `users/${uid}/profile`), profile);
  } catch (err) {
    console.warn('saveProfile failed:', err);
  }
}

export async function loadProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await get(ref(database, `users/${uid}/profile`));
    return snap.exists() ? (snap.val() as UserProfile) : null;
  } catch (err) {
    console.warn('loadProfile failed:', err);
    return null;
  }
}

export async function patchProfile(uid: string, partial: Partial<UserProfile>): Promise<void> {
  try {
    await update(ref(database, `users/${uid}/profile`), partial);
  } catch (err) {
    console.warn('patchProfile failed:', err);
  }
}
