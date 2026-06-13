import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { ExerciseId } from '../data/exercises';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  ProfileSetup: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  AnalyticsTab: undefined;
  CoachTab: undefined;
  SettingsTab: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  ExerciseSelect: undefined;
  CameraCalibration: { exerciseId: ExerciseId };
  Workout: { exerciseId: ExerciseId };
  SessionSummary: { sessionId: string };
};

export type AnalyticsStackParamList = {
  Analytics: undefined;
  WorkoutHistory: undefined;
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
export type CameraCalibrationNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'CameraCalibration'>;
export type WorkoutNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Workout'>;
export type SessionSummaryNavigationProp = NativeStackNavigationProp<HomeStackParamList, 'SessionSummary'>;
export type AnalyticsNavigationProp = NativeStackNavigationProp<AnalyticsStackParamList, 'Analytics'>;
export type WorkoutHistoryNavigationProp = NativeStackNavigationProp<AnalyticsStackParamList, 'WorkoutHistory'>;
export type AICoachNavigationProp = NativeStackNavigationProp<CoachStackParamList, 'AICoach'>;
export type SettingsNavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'Settings'>;

export type CameraCalibrationRouteProp = RouteProp<HomeStackParamList, 'CameraCalibration'>;
export type WorkoutRouteProp = RouteProp<HomeStackParamList, 'Workout'>;
export type SessionSummaryRouteProp = RouteProp<HomeStackParamList, 'SessionSummary'>;
