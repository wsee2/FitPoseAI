import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, BorderRadius, Typography } from '../theme';
import { ProgressRing } from '../components/ui/ProgressRing';
import { NeonButton } from '../components/ui/NeonButton';
import { useApp } from '../context/AppContext';
import { EXERCISES, formatDuration, getScoreGrade } from '../data/exercises';
import type { HomeStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'SessionSummary'>;
  route: RouteProp<HomeStackParamList, 'SessionSummary'>;
};

const BADGES = [
  { id: 'reps', threshold: 20, label: 'Rep Master', icon: '🏆', color: Colors.gold },
  { id: 'score', threshold: 85, label: 'Form Expert', icon: '⭐', color: Colors.cyan },
  { id: 'streak', threshold: 0, label: 'On Fire!', icon: '🔥', color: Colors.orange },
];

export default function SessionSummaryScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const { workoutHistory } = useApp();
  const insets = useSafeAreaInsets();
  const session = workoutHistory.find(s => s.id === sessionId) ?? workoutHistory[0];
  const exercise = session ? EXERCISES[session.exerciseId] : EXERCISES.squat;
  const grade = session ? getScoreGrade(session.score) : getScoreGrade(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const trophyBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      ]),
      Animated.timing(slideUp, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(trophyBounce, { toValue: -8, duration: 600, useNativeDriver: true }),
        Animated.timing(trophyBounce, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (!session) return null;

  const earnedBadges = BADGES.filter(b => {
    if (b.id === 'reps') return session.reps >= b.threshold;
    if (b.id === 'score') return session.score >= b.threshold;
    return true;
  });

  const statItems = [
    { label: 'Reps', value: session.reps.toString(), color: exercise.accentColor, icon: '🔁' },
    { label: 'Duration', value: formatDuration(session.duration), color: Colors.cyan, icon: '⏱' },
    { label: 'Calories', value: `${session.calories}`, unit: 'kcal', color: Colors.orange, icon: '🔥' },
    { label: 'Form', value: session.formQuality, color: Colors.success, icon: '✓' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#060612', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Celebration glow */}
      <View style={[styles.glow, { backgroundColor: `${exercise.accentColor}08` }]} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>

          {/* Trophy */}
          <View style={styles.trophyArea}>
            <Animated.Text style={[styles.trophy, { transform: [{ translateY: trophyBounce }] }]}>
              🏅
            </Animated.Text>
            <Text style={styles.congrats}>Workout Complete!</Text>
          </View>

          {/* Grade & Score ring */}
          <View style={styles.scoreSection}>
            <View style={styles.gradeCircle}>
              <LinearGradient
                colors={[`${grade.color}20`, `${grade.color}08`]}
                style={styles.gradeGrad}
              >
                <Text style={[styles.gradeText, { color: grade.color }]}>{grade.grade}</Text>
                <Text style={styles.gradeLabel}>Grade</Text>
              </LinearGradient>
            </View>

            <ProgressRing
              progress={session.score}
              size={140}
              strokeWidth={12}
              color={exercise.accentColor}
              label={session.score.toString()}
              sublabel="score"
              animated
            />

            <View style={styles.exerciseInfo}>
              <Text style={[styles.exerciseName, { color: exercise.accentColor }]}>{exercise.name}</Text>
              <Text style={styles.exerciseDate}>{session.date}</Text>
            </View>
          </View>

          {/* Stats grid */}
          <Animated.View style={[styles.statsGrid, { transform: [{ translateY: slideUp }] }]}>
            {statItems.map((item, i) => (
              <View key={i} style={styles.statBox}>
                <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.statBoxGrad}>
                  <Text style={styles.statIcon}>{item.icon}</Text>
                  <Text style={[styles.statValue, { color: item.color }]}>{item.value}</Text>
                  {item.unit && <Text style={styles.statUnit}>{item.unit}</Text>}
                  <Text style={styles.statLabel}>{item.label}</Text>
                </LinearGradient>
              </View>
            ))}
          </Animated.View>

          {/* Badges */}
          {earnedBadges.length > 0 && (
            <View style={styles.badgesSection}>
              <Text style={styles.badgesTitle}>Earned Today</Text>
              <View style={styles.badgesRow}>
                {earnedBadges.map((badge) => (
                  <View key={badge.id} style={[styles.badgeItem, { borderColor: `${badge.color}40`, backgroundColor: `${badge.color}12` }]}>
                    <Text style={styles.badgeIcon}>{badge.icon}</Text>
                    <Text style={[styles.badgeLabel, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Performance bar */}
          <View style={styles.perfSection}>
            <Text style={styles.perfTitle}>Performance Breakdown</Text>
            {[
              { label: 'Form Quality', value: session.score, color: exercise.accentColor },
              { label: 'Consistency', value: Math.min(100, session.score + 5), color: Colors.cyan },
              { label: 'Intensity', value: Math.min(100, Math.round(session.reps / 0.3)), color: Colors.orange },
            ].map((item, i) => (
              <View key={i} style={styles.perfRow}>
                <Text style={styles.perfLabel}>{item.label}</Text>
                <View style={styles.perfBarTrack}>
                  <View style={[styles.perfBarFill, { width: `${Math.min(item.value, 100)}%`, backgroundColor: item.color }]} />
                </View>
                <Text style={[styles.perfValue, { color: item.color }]}>{Math.min(item.value, 100)}</Text>
              </View>
            ))}
          </View>

          {/* AI Insight */}
          <View style={styles.insightCard}>
            <LinearGradient colors={['#1A0D00', '#120900']} style={styles.insightGrad}>
              <LinearGradient colors={['rgba(255,138,0,0.1)', 'transparent']} style={StyleSheet.absoluteFill} />
              <Text style={styles.insightIcon}>🤖</Text>
              <View style={styles.insightText}>
                <Text style={styles.insightTitle}>AI Coach says</Text>
                <Text style={styles.insightBody}>
                  {session.score >= 85
                    ? `Excellent work! Your ${exercise.name.toLowerCase()} form is on point. Keep this consistency!`
                    : session.score >= 70
                    ? `Good session! Focus on your form at the bottom position for even better results.`
                    : `Keep practicing! Your body is adapting. Consistency is the key to progress.`}
                </Text>
              </View>
            </LinearGradient>
          </View>

        </Animated.View>
      </ScrollView>

      {/* Bottom actions — paddingBottom clears system nav (insets.bottom) + tab bar (60px) */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 76 }]}>
        <LinearGradient colors={['transparent', Colors.background]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => navigation.navigate('ExerciseSelect')}
            style={styles.ghostBtn}
          >
            <Text style={styles.ghostBtnText}>New Workout</Text>
          </TouchableOpacity>
          <NeonButton
            title="Back to Home"
            onPress={() => navigation.popToTop()}
            variant="primary"
            size="md"
            style={styles.homeBtn}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  glow: { position: 'absolute', width: 400, height: 400, borderRadius: 200, top: 0, alignSelf: 'center' },
  content: { paddingHorizontal: 20 },
  trophyArea: { alignItems: 'center', marginBottom: 24 },
  trophy: { fontSize: 64, marginBottom: 8 },
  congrats: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  scoreSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  gradeCircle: { borderRadius: 20, overflow: 'hidden' },
  gradeGrad: { width: 90, height: 90, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  gradeText: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  gradeLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', letterSpacing: 1 },
  exerciseInfo: { alignItems: 'flex-end' },
  exerciseName: { fontSize: 18, fontWeight: '800' },
  exerciseDate: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statBox: { width: '47.5%', borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  statBoxGrad: { padding: 18, alignItems: 'center', gap: 4 },
  statIcon: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  statUnit: { fontSize: 11, color: Colors.textMuted, marginTop: -2 },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  badgesSection: { marginBottom: 24 },
  badgesTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
  badgesRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  badgeItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  badgeIcon: { fontSize: 18 },
  badgeLabel: { fontSize: 13, fontWeight: '700' },
  perfSection: { marginBottom: 24 },
  perfTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 14 },
  perfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  perfLabel: { width: 110, fontSize: 13, color: Colors.textSecondary },
  perfBarTrack: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  perfBarFill: { height: '100%', borderRadius: 3 },
  perfValue: { width: 28, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  insightCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.orangeGlow },
  insightGrad: { flexDirection: 'row', padding: 16, gap: 12, alignItems: 'flex-start' },
  insightIcon: { fontSize: 28 },
  insightText: { flex: 1 },
  insightTitle: { fontSize: 12, color: Colors.orange, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  insightBody: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  bottomActions: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: 20 },
  actionRow: { flexDirection: 'row', gap: 12 },
  ghostBtn: { flex: 1, height: 52, backgroundColor: Colors.card, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  homeBtn: { flex: 1.5 },
});
