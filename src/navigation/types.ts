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
  VideoTab: undefined;
  CoachTab: undefined;
  SettingsTab: undefined;
};

export type VideoStackParamList = {
  VideoAnalysis: { exerciseId?: ExerciseId };
};

export type HomeStackParamList = {
  Home: undefined;
  ExerciseSelect: undefined;
  Workout: { exerciseId: ExerciseId };
  SessionSummary: { sessionId: string };
  VideoAnalysis: { exerciseId?: ExerciseId };
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
