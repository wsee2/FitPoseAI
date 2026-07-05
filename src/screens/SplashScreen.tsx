import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Colors, Typography } from '../theme';
import { subscribeToAuthState } from '../services/firebaseAuth';
import { loadProfile } from '../services/firebaseProfile';

const { width } = Dimensions.get('window');
type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'> };

export default function SplashScreen({ navigation }: Props) {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.timing(ringRotation, { toValue: 1, duration: 2000, useNativeDriver: true })
    ).start();

    Animated.timing(barWidth, { toValue: 1, duration: 1800, delay: 200, useNativeDriver: false }).start();

    let navigated = false;
    let minDelayDone = false;
    let pending: keyof RootStackParamList | null = null;

    const go = (dest: keyof RootStackParamList) => {
      if (navigated) return;
      if (!minDelayDone) { pending = dest; return; }
      navigated = true;
      navigation.replace(dest);
    };

    // Give the logo animation a moment to breathe before navigating away.
    const minTimer = setTimeout(() => {
      minDelayDone = true;
      if (pending) { navigated = true; navigation.replace(pending); }
    }, 1400);

    // Safety: if onAuthStateChanged never fires within 5 s, go to Login.
    const fallback = setTimeout(() => go('Login'), 5000);

    const unsub = subscribeToAuthState(async (user) => {
      clearTimeout(fallback);
      if (user) {
        const profile = await loadProfile(user.uid);
        go(profile ? 'Main' : 'ProfileSetup');
      } else {
        go('Login');
      }
    });

    return () => {
      clearTimeout(minTimer);
      clearTimeout(fallback);
      unsub();
    };
  }, []);

  const spin = ringRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const barInterpolate = barWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0A', '#0D0D1A', '#0A0A0A']} style={StyleSheet.absoluteFill} />
      <View style={styles.glowBg} />
      <Animated.View style={[styles.logoArea, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]}>
          <Svg width={160} height={160} viewBox="0 0 160 160">
            <Defs>
              <SvgGrad id="ringG" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#00E5FF" stopOpacity="1" />
                <Stop offset="50%" stopColor="#0066FF" stopOpacity="0.6" />
                <Stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
              </SvgGrad>
            </Defs>
            <Circle cx="80" cy="80" r="70" stroke="url(#ringG)" strokeWidth="3" fill="none"
              strokeDasharray="180 260" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <View style={styles.innerLogo}>
          <Svg width={64} height={64} viewBox="0 0 64 64" fill="none">
            <Path d="M32 8C18.74 8 8 18.74 8 32C8 45.26 18.74 56 32 56C45.26 56 56 45.26 56 32C56 18.74 45.26 8 32 8Z"
              fill={Colors.cyanDim} />
            <Path d="M24 20L32 14L40 20V32L32 38L24 32V20Z" fill={Colors.cyan} fillOpacity="0.9" />
            <Path d="M20 38L32 44L44 38" stroke={Colors.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="32" cy="24" r="4" fill={Colors.textPrimary} />
          </Svg>
        </View>
      </Animated.View>
      <Animated.View style={{ opacity: logoOpacity }}>
        <Text style={styles.brandName}>FitPose<Text style={styles.brandAccent}> AI</Text></Text>
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        AI-Powered Posture Coaching
      </Animated.Text>
      <View style={styles.barContainer}>
        <Animated.View style={[styles.barFill, { width: barInterpolate }]}>
          <LinearGradient colors={['#00E5FF', '#0066FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      <Text style={styles.versionText}>Version 1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  glowBg: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: Colors.cyanDim, top: '30%', alignSelf: 'center' },
  logoArea: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  ring: { position: 'absolute' },
  innerLogo: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cyanGlow, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  brandName: { fontSize: 36, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  brandAccent: { color: Colors.cyan },
  tagline: { ...Typography.body, color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 64 },
  barContainer: { position: 'absolute', bottom: 80, width: width * 0.5, height: 3, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  versionText: { position: 'absolute', bottom: 48, fontSize: 12, color: Colors.textMuted, letterSpacing: 0.5 },
});
