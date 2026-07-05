import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCHseFM0MGGNbF0V_odxFg_dEqWokIMbpQ',
  authDomain: 'ai-posture-4953f.firebaseapp.com',
  databaseURL: 'https://ai-posture-4953f-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ai-posture-4953f',
  storageBucket: 'ai-posture-4953f.firebasestorage.app',
  messagingSenderId: '400873057576',
  appId: '1:400873057576:web:1e5bf64c136f9a55eaf41d',
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);

// getReactNativePersistence stores the Firebase Auth token in AsyncStorage so the
// user stays signed in across app restarts until they explicitly sign out.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export default app;
