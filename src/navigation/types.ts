import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { ExerciseId } from '../data/exercises';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  ProfileSetup: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  AnalyticsTab: undefined;
  // VideoTab hidden — feature deprioritised, see report future work.
  // VideoTab: undefined;
  CoachTab: undefined;
  SettingsTab: undefined;
};

export type VideoStackParamList = {
  VideoAnalysis: { exerciseId?: ExerciseId };
};

export type HomeStackParamList = {
  Home: undefined;
  ExerciseSelect: undefined;
  // Both ExerciseSelectScreen's Start and HomeScreen's quick-start pill route through here
  // now — WorkoutSetupScreen owns per-set target + sets-per-session, so Workout itself
  // always receives them explicitly (target/sets below stay optional only as a defensive
  // fallback, e.g. deep-linking straight to Workout — see WorkoutScreen's
  // getDefaultTarget/DEFAULT_SETS fallback).
  WorkoutSetup: { exerciseId: ExerciseId };
  Workout: { exerciseId: ExerciseId; target?: number; sets?: number };
  SessionSummary: { sessionId: string };
  // VideoAnalysis hidden — feature deprioritised, see report future work.
  // VideoAnalysis: { exerciseId?: ExerciseId };
};

export type AnalyticsStackParamList = {
  Analytics: undefined;
  WorkoutHistory: undefined;
  ScoreDetail: { mode: 'weekly' | 'monthly' };
};

export type SettingsStackParamList = {
  Settings: undefined;
};

export type CoachStackParamList = {
  AICoach: undefined;
};

export type HomeScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Home'>,
  BottomTabNavigationProp<MainTabParamList>
>;

export type ExerciseSelectNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ExerciseSelect'>;
export type WorkoutSetupNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'WorkoutSetup'>;
export type WorkoutNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
export type SessionSummaryNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'SessionSummary'>;
export type AnalyticsNavigationProp = NativeStackNavigationProp<AnalyticsStackParamList, 'Analytics'>;
export type WorkoutHistoryNavigationProp = NativeStackNavigationProp<AnalyticsStackParamList, 'WorkoutHistory'>;
export type ScoreDetailNavigationProp = NativeStackNavigationProp<AnalyticsStackParamList, 'ScoreDetail'>;
export type ScoreDetailRouteProp = RouteProp<AnalyticsStackParamList, 'ScoreDetail'>;
export type AICoachNavigationProp = NativeStackNavigationProp<CoachStackParamList, 'AICoach'>;
export type SettingsNavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'Settings'>;

export type WorkoutRouteProp = RouteProp<HomeStackParamList, 'Workout'>;
export type SessionSummaryRouteProp = RouteProp<HomeStackParamList, 'SessionSummary'>;
