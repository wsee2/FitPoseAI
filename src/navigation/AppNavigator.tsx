import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RootStackParamList,
  MainTabParamList,
  HomeStackParamList,
  AnalyticsStackParamList,
  CoachStackParamList,
  SettingsStackParamList,
  VideoStackParamList,
} from './types';
import { Colors } from '../theme';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import HomeScreen from '../screens/HomeScreen';
import ExerciseSelectScreen from '../screens/ExerciseSelectScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import SessionSummaryScreen from '../screens/SessionSummaryScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import WorkoutHistoryScreen from '../screens/WorkoutHistoryScreen';
import AICoachScreen from '../screens/AICoachScreen';
import SettingsScreen from '../screens/SettingsScreen';
import VideoAnalysisScreen from '../screens/VideoAnalysisScreen';
import ScoreDetailScreen from '../screens/ScoreDetailScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const AnalyticsStack = createNativeStackNavigator<AnalyticsStackParamList>();
const CoachStack = createNativeStackNavigator<CoachStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const VideoStack = createNativeStackNavigator<VideoStackParamList>();

const HomeNavigator = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="Home" component={HomeScreen} />
    <HomeStack.Screen name="ExerciseSelect" component={ExerciseSelectScreen} />
    <HomeStack.Screen name="Workout" component={WorkoutScreen} />
    <HomeStack.Screen name="SessionSummary" component={SessionSummaryScreen} />
    <HomeStack.Screen name="VideoAnalysis" component={VideoAnalysisScreen} />
  </HomeStack.Navigator>
);

const AnalyticsNavigator = () => (
  <AnalyticsStack.Navigator screenOptions={{ headerShown: false }}>
    <AnalyticsStack.Screen name="Analytics" component={AnalyticsScreen} />
    <AnalyticsStack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} />
    <AnalyticsStack.Screen name="ScoreDetail" component={ScoreDetailScreen} />
  </AnalyticsStack.Navigator>
);

const CoachNavigator = () => (
  <CoachStack.Navigator screenOptions={{ headerShown: false }}>
    <CoachStack.Screen name="AICoach" component={AICoachScreen} />
  </CoachStack.Navigator>
);

const SettingsNavigator = () => (
  <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
    <SettingsStack.Screen name="Settings" component={SettingsScreen} />
  </SettingsStack.Navigator>
);

const VideoNavigator = () => (
  <VideoStack.Navigator screenOptions={{ headerShown: false }}>
    <VideoStack.Screen name="VideoAnalysis" component={VideoAnalysisScreen} />
  </VideoStack.Navigator>
);

const HomeIcon = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Path d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
      stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" />
  </Svg>
);

const AnalyticsIcon = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="13" width="4" height="8" rx="1" stroke={color} strokeWidth="2" />
    <Rect x="10" y="8" width="4" height="13" rx="1" stroke={color} strokeWidth="2" />
    <Rect x="17" y="3" width="4" height="18" rx="1" stroke={color} strokeWidth="2" />
  </Svg>
);

const CoachIcon = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2" />
    <Path d="M4 20C4 17 7.58 14 12 14C16.42 14 20 17 20 20" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M19 8L21 6M19 6L21 8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Circle cx="20" cy="4" r="2" stroke={color} strokeWidth="1.5" />
  </Svg>
);

const VideoIcon = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="6" width="14" height="12" rx="2" stroke={color} strokeWidth="2" />
    <Path d="M16 9L22 6V18L16 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SettingsIcon = ({ color }: { color: string }) => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
    <Path d="M12 2V4M12 20V22M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M2 12H4M20 12H22M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22"
      stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

const MainNavigator = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          ...styles.tabBar,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: Colors.cyan,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => {
          if (route.name === 'HomeTab') return <HomeIcon color={color} />;
          if (route.name === 'AnalyticsTab') return <AnalyticsIcon color={color} />;
          if (route.name === 'VideoTab') return <VideoIcon color={color} />;
          if (route.name === 'CoachTab') return <CoachIcon color={color} />;
          return <SettingsIcon color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="AnalyticsTab" component={AnalyticsNavigator} options={{ tabBarLabel: 'Progress' }} />
      <Tab.Screen name="VideoTab" component={VideoNavigator} options={{ tabBarLabel: 'Video' }} />
      <Tab.Screen name="CoachTab" component={CoachNavigator} options={{ tabBarLabel: 'AI Coach' }} />
      <Tab.Screen name="SettingsTab" component={SettingsNavigator} options={{ tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => (
  <NavigationContainer>
    <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <RootStack.Screen name="Splash" component={SplashScreen} />
      <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="SignUp" component={SignUpScreen} />
      <RootStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      <RootStack.Screen name="Main" component={MainNavigator} options={{ animation: 'fade' }} />
    </RootStack.Navigator>
  </NavigationContainer>
);

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    elevation: 8,
    height: 60,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
});
