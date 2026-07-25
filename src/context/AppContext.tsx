import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ExerciseId, WorkoutSession } from '../data/exercises';
import { subscribeToAuthState, logout } from '../services/firebaseAuth';
import { loadProfile, saveProfile, patchProfile } from '../services/firebaseProfile';
import { saveSession, loadSessions } from '../services/firebaseWorkout';
import { todayMYTDateStr } from '../utils/mytDate';

export type Gender = 'male' | 'female' | 'other';
export type FitnessGoal = 'lose_weight' | 'build_muscle' | 'improve_endurance' | 'flexibility';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type AvatarStyle = 'male_athletic' | 'male_casual' | 'female_athletic' | 'female_casual';
export type VoiceType = 'energetic_male' | 'calm_male' | 'energetic_female' | 'calm_female';

export interface UserProfile {
  name: string;
  gender: Gender;
  goal: FitnessGoal;
  level: ExperienceLevel;
  avatar: AvatarStyle;
  voice: VoiceType;
  streak: number;
  totalWorkouts: number;
  totalReps: number;
}

export interface ActiveWorkout {
  exerciseId: ExerciseId | null;
  startTime: number | null;
  reps: number;
  score: number;
  isActive: boolean;
  isPaused: boolean;
}

interface AppContextValue {
  authUser: User | null;
  isLoadingAuth: boolean;
  signOutUser: () => Promise<void>;
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  updateProfile: (partial: Partial<UserProfile>) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (v: boolean) => void;
  workoutHistory: WorkoutSession[];
  addWorkoutSession: (session: WorkoutSession) => void;
  lastCoachMessage: string | null;
  setLastCoachMessage: (msg: string | null) => void;
  activeWorkout: ActiveWorkout;
  startWorkout: (exerciseId: ExerciseId) => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  stopWorkout: () => WorkoutSession | null;
  incrementRep: () => void;
  updateScore: (score: number) => void;
}

const defaultActiveWorkout: ActiveWorkout = {
  exerciseId: null, startTime: null, reps: 0, score: 0, isActive: false, isPaused: false,
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout>(defaultActiveWorkout);
  const [lastCoachMessage, setLastCoachMessage] = useState<string | null>(null);

  // Stable ref so fire-and-forget callbacks always see the current user.
  const authUserRef = useRef<User | null>(null);
  authUserRef.current = authUser;

  useEffect(() => {
    const unsub = subscribeToAuthState(async (user) => {
      setAuthUser(user);
      authUserRef.current = user;

      if (user) {
        const [savedProfile, savedSessions] = await Promise.all([
          loadProfile(user.uid),
          loadSessions(user.uid),
        ]);
        if (savedProfile) {
          setProfileState(savedProfile);
          setHasCompletedOnboarding(true);
        }
        setWorkoutHistory(savedSessions);
      } else {
        setProfileState(null);
        setWorkoutHistory([]);
        setHasCompletedOnboarding(false);
      }

      setIsLoadingAuth(false);
    });
    return unsub;
  }, []);

  const setProfile = useCallback((p: UserProfile) => {
    setProfileState(p);
    const uid = authUserRef.current?.uid;
    if (uid) saveProfile(uid, p);
  }, []);

  const updateProfile = useCallback((partial: Partial<UserProfile>) => {
    setProfileState((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...partial };
      const uid = authUserRef.current?.uid;
      if (uid) patchProfile(uid, partial);
      return updated;
    });
  }, []);

  const addWorkoutSession = useCallback((session: WorkoutSession) => {
    setWorkoutHistory((prev) => [session, ...prev]);
    setProfileState((prev) =>
      prev ? { ...prev, totalWorkouts: prev.totalWorkouts + 1, totalReps: prev.totalReps + session.reps } : null
    );
    saveSession(session); // reads auth.currentUser internally
  }, []);

  const signOutUser = useCallback(async () => {
    await logout();
    // auth state listener clears everything.
  }, []);

  const startWorkout = useCallback((exerciseId: ExerciseId) => {
    setActiveWorkout({ exerciseId, startTime: Date.now(), reps: 0, score: 0, isActive: true, isPaused: false });
  }, []);

  const pauseWorkout = useCallback(() => setActiveWorkout((p) => ({ ...p, isPaused: true })), []);
  const resumeWorkout = useCallback(() => setActiveWorkout((p) => ({ ...p, isPaused: false })), []);

  const stopWorkout = useCallback((): WorkoutSession | null => {
    if (!activeWorkout.exerciseId || !activeWorkout.startTime) return null;
    const duration = Math.floor((Date.now() - activeWorkout.startTime) / 1000);
    const session: WorkoutSession = {
      id: Date.now().toString(),
      exerciseId: activeWorkout.exerciseId,
      date: todayMYTDateStr(),
      reps: activeWorkout.reps, duration,
      score: activeWorkout.score,
      calories: Math.round(activeWorkout.reps * 0.3),
      formQuality: activeWorkout.score >= 90 ? 'Excellent' : activeWorkout.score >= 75 ? 'Good' : activeWorkout.score >= 60 ? 'Fair' : 'Needs Work',
    };
    setActiveWorkout(defaultActiveWorkout);
    return session;
  }, [activeWorkout]);

  const incrementRep = useCallback(() => setActiveWorkout((p) => ({ ...p, reps: p.reps + 1 })), []);
  const updateScore = useCallback((score: number) => setActiveWorkout((p) => ({ ...p, score })), []);

  return (
    <AppContext.Provider value={{
      authUser, isLoadingAuth, signOutUser,
      profile, setProfile, updateProfile,
      hasCompletedOnboarding, setHasCompletedOnboarding,
      workoutHistory, addWorkoutSession,
      lastCoachMessage, setLastCoachMessage,
      activeWorkout, startWorkout, pauseWorkout, resumeWorkout, stopWorkout, incrementRep, updateScore,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
