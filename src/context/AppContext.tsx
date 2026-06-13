import React, { createContext, useContext, useState, useCallback } from 'react';
import { ExerciseId, WorkoutSession, MOCK_HISTORY } from '../data/exercises';

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
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  updateProfile: (partial: Partial<UserProfile>) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (v: boolean) => void;
  workoutHistory: WorkoutSession[];
  addWorkoutSession: (session: WorkoutSession) => void;
  activeWorkout: ActiveWorkout;
  startWorkout: (exerciseId: ExerciseId) => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  stopWorkout: () => WorkoutSession | null;
  incrementRep: () => void;
  updateScore: (score: number) => void;
}

const defaultActiveWorkout: ActiveWorkout = {
  exerciseId: null,
  startTime: null,
  reps: 0,
  score: 0,
  isActive: false,
  isPaused: false,
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>(MOCK_HISTORY);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout>(defaultActiveWorkout);

  const setProfile = useCallback((p: UserProfile) => setProfileState(p), []);

  const updateProfile = useCallback((partial: Partial<UserProfile>) => {
    setProfileState(prev => prev ? { ...prev, ...partial } : null);
  }, []);

  const addWorkoutSession = useCallback((session: WorkoutSession) => {
    setWorkoutHistory(prev => [session, ...prev]);
    setProfileState(prev => prev ? {
      ...prev,
      totalWorkouts: prev.totalWorkouts + 1,
      totalReps: prev.totalReps + session.reps,
    } : null);
  }, []);

  const startWorkout = useCallback((exerciseId: ExerciseId) => {
    setActiveWorkout({
      exerciseId,
      startTime: Date.now(),
      reps: 0,
      score: 0,
      isActive: true,
      isPaused: false,
    });
  }, []);

  const pauseWorkout = useCallback(() => {
    setActiveWorkout(prev => ({ ...prev, isPaused: true }));
  }, []);

  const resumeWorkout = useCallback(() => {
    setActiveWorkout(prev => ({ ...prev, isPaused: false }));
  }, []);

  const stopWorkout = useCallback((): WorkoutSession | null => {
    if (!activeWorkout.exerciseId || !activeWorkout.startTime) return null;
    const duration = Math.floor((Date.now() - activeWorkout.startTime) / 1000);
    const session: WorkoutSession = {
      id: Date.now().toString(),
      exerciseId: activeWorkout.exerciseId,
      date: new Date().toISOString().split('T')[0],
      reps: activeWorkout.reps,
      duration,
      score: activeWorkout.score,
      calories: Math.round(activeWorkout.reps * 0.3),
      formQuality: activeWorkout.score >= 90 ? 'Excellent' :
                   activeWorkout.score >= 75 ? 'Good' :
                   activeWorkout.score >= 60 ? 'Fair' : 'Needs Work',
    };
    setActiveWorkout(defaultActiveWorkout);
    return session;
  }, [activeWorkout]);

  const incrementRep = useCallback(() => {
    setActiveWorkout(prev => ({ ...prev, reps: prev.reps + 1 }));
  }, []);

  const updateScore = useCallback((score: number) => {
    setActiveWorkout(prev => ({ ...prev, score }));
  }, []);

  return (
    <AppContext.Provider value={{
      profile,
      setProfile,
      updateProfile,
      hasCompletedOnboarding,
      setHasCompletedOnboarding,
      workoutHistory,
      addWorkoutSession,
      activeWorkout,
      startWorkout,
      pauseWorkout,
      resumeWorkout,
      stopWorkout,
      incrementRep,
      updateScore,
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
