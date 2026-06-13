import { ref, push } from 'firebase/database';
import { database } from './firebaseConfig';

export const saveWorkout = async () => {
  try {
    await push(ref(database, 'workouts'), {
      exercise: 'Push Up',
      score: 95,
      reps: 15,
      timestamp: Date.now(),
    });

    console.log('Workout saved');
  } catch (error) {
    console.error(error);
  }
};