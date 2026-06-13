import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCHseFM0MGGNbF0V_odxFg_dEqWokIMbpQ",
  authDomain: "ai-posture-4953f.firebaseapp.com",
  databaseURL: "https://ai-posture-4953f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ai-posture-4953f",
  storageBucket: "ai-posture-4953f.firebasestorage.app",
  messagingSenderId: "400873057576",
  appId: "1:400873057576:web:1e5bf64c136f9a55eaf41d"
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);

export default app;