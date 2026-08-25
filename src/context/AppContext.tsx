import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ExerciseId, WorkoutSession } from '../data/exercises';
import { subscribeToAuthState, logout } from '../services/firebaseAuth';
import { loadProfile, saveProfile, patchProfile } from '../services/firebaseProfile';
import { saveSession, loadSessions } from '../services/firebaseWorkout';
import { todayMYTDateStr } from '../utils/mytDate';
import { computeStreak } from '../utils/streak';
import { computeEligibleLevel, isHigherLevel } from '../utils/experienceLevel';
import { getLevelUpMessage } from '../services/aiCoach';
import { setVoiceProfile } from '../services/ttsService';
import { syncReminderState } from '../services/notificationsService';

export type Gender = 'male' | 'female' | 'other';
export type FitnessGoal = 'lose_weight' | 'build_muscle' | 'improve_endurance' | 'flexibility';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type VoiceType = 'male' | 'female';

export interface UserProfile {
  name: string;
  gender: Gender;
  goal: FitnessGoal;
  level: ExperienceLevel;
  voice: VoiceType;
  notificationsEnabled: boolean;
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

  // Keeps ttsService's module-level voice profile in sync with Settings' Voice Type picker,
  // wherever in the app that setting was last changed (or on initial profile load).
  useEffect(() => {
    if (profile?.voice) setVoiceProfile(profile.voice);
  }, [profile?.voice]);

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
    saveSession(session); // reads auth.currentUser internally
  }, []);

  // Streak/totalWorkouts/totalReps are derived from actual session history rather than
  // incremented/decremented imperatively, so they're always correct on load and never
  // silently go stale or desync from what's actually in workoutHistory.
  //
  // Experience level auto-upgrades the same way: computeEligibleLevel looks at how long ago
  // the user's FIRST logged session was (not account-creation date) and how many sessions
  // they've logged since, and this only ever moves the stored level UP — it never overrides
  // a level the user set themselves (at onboarding or later in Settings) that's already at
  // or above what their history alone would earn. Re-running whenever `profile` changes is
  // what lets this settle to "no further upgrade due" on the next pass after updateProfile
  // applies one, rather than needing separate one-shot tracking.
  useEffect(() => {
    if (!profile) return;
    const streak = computeStreak(workoutHistory);
    const totalWorkouts = workoutHistory.length;
    const totalReps = workoutHistory.reduce((sum, s) => sum + s.reps, 0);
    const patch: Partial<UserProfile> = {};
    if (streak !== profile.streak) patch.streak = streak;
    if (totalWorkouts !== profile.totalWorkouts) patch.totalWorkouts = totalWorkouts;
    if (totalReps !== profile.totalReps) patch.totalReps = totalReps;

    const eligibleLevel = computeEligibleLevel(workoutHistory);
    if (isHigherLevel(eligibleLevel, profile.level)) {
      patch.level = eligibleLevel;
      getLevelUpMessage(eligibleLevel, profile.goal).then((msg) => {
        if (msg) setLastCoachMessage(msg);
      }).catch(() => {});
    }

    if (Object.keys(patch).length > 0) {
      updateProfile(patch);
    }
  }, [workoutHistory, profile, updateProfile]);

  // Keeps the OS-scheduled daily reminder in sync with the profile's notificationsEnabled
  // field, on every load/change — not just when the user flips the Settings toggle — since
  // the ACTUAL OS-level schedule is per-device and doesn't transfer with a synced profile
  // (e.g. a fresh install or a new device needs its own real scheduleNotificationAsync call
  // even though the stored preference already says "on"). If the user wants reminders on
  // but OS permission was denied, this reverts the stored field to false so it can't claim
  // to be "on" while nothing is actually scheduled — SettingsScreen's own toggle handler is
  // what shows the user-facing "permission denied" alert at the moment they flip it.
  useEffect(() => {
    if (!profile) return;
    syncReminderState(profile.notificationsEnabled).then((granted) => {
      if (!granted && profile.notificationsEnabled) {
        updateProfile({ notificationsEnabled: false });
      }
    }).catch(() => {});
  }, [profile?.notificationsEnabled, updateProfile]);

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
