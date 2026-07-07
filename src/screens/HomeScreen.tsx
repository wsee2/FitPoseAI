import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, BorderRadius, Spacing } from '../theme';
import { ExerciseIcon } from '../components/ui/ExerciseIcon';
import { StatCard } from '../components/ui/StatCard';
import { NeonButton } from '../components/ui/NeonButton';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useApp } from '../context/AppContext';
import { EXERCISES, MOCK_HISTORY, formatDuration, getScoreGrade } from '../data/exercises';
import type { HomeScreenNavigationProp } from '../navigation/types';
import { saveWorkout } from '../services/firebaseWorkout';

const { width } = Dimensions.get('window');
type Props = { navigation: HomeScreenNavigationProp };

const EXERCISE_LIST = Object.values(EXERCISES);

export default function HomeScreen({ navigation }: Props) {
  const { profile, workoutHistory } = useApp();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const recentSessions = workoutHistory.slice(0, 3);
  const weeklyScore = Math.round(
    recentSessions.reduce((sum, s) => sum + s.score, 0) / Math.max(recentSessions.length, 1)
  );
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = profile?.name?.split(' ')[0] ?? 'Athlete';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{greeting()},</Text>
              <Text style={styles.username}>{firstName} 👋</Text>
            </View>
            <TouchableOpacity style={styles.avatarBtn} onPress={() => navigation.getParent()?.navigate('SettingsTab')}>
              <LinearGradient colors={[Colors.cyanDim, Colors.card]} style={styles.avatar}>
                <Text style={styles.avatarInitial}>{firstName[0]?.toUpperCase()}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Quick stats */}
          <View style={styles.statsRow}>
            <StatCard
              label="Day Streak"
              value={profile?.streak ?? 14}
              unit="days"
              accentColor={Colors.gold}
              trend={{ value: '+2', positive: true }}
              style={styles.statCardFlex}
            />
            <StatCard
              label="Weekly Score"
              value={weeklyScore}
              unit="pts"
              accentColor={Colors.cyan}
              trend={{ value: '+8', positive: true }}
              style={styles.statCardFlex}
            />
            <StatCard
              label="Total Workouts"
              value={profile?.totalWorkouts ?? 28}
              accentColor={Colors.success}
              style={styles.statCardFlex}
            />
          </View>

          {/* CTA banner */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.navigate('ExerciseSelect')}
            style={styles.ctaBannerWrapper}
          >
            <LinearGradient
              colors={['#001A33', '#00101F']}
              style={styles.ctaBanner}
            >
              <LinearGradient
                colors={['rgba(0,229,255,0.15)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.ctaGlowLine} />
              <View style={styles.ctaContent}>
                <View>
                  <Text style={styles.ctaOverline}>AI COACH READY</Text>
                  <Text style={styles.ctaTitle}>Start Today's{'\n'}Workout</Text>
                  <View style={styles.ctaChip}>
                    <Text style={styles.ctaChipText}>5 exercises available</Text>
                  </View>
                </View>
                <View style={styles.ctaRight}>
                  <ProgressRing
                    progress={weeklyScore}
                    size={80}
                    strokeWidth={7}
                    color={Colors.cyan}
                    label={`${weeklyScore}`}
                    sublabel="avg score"
                  />
                </View>
              </View>
              <View style={styles.ctaArrow}>
                <Text style={styles.ctaArrowText}>Start →</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Exercises */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Exercises</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ExerciseSelect')}>
              <Text style={styles.sectionLink}>See all</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.exerciseScrollContent}
          >
            {EXERCISE_LIST.map((ex) => (
              <TouchableOpacity
                key={ex.id}
                style={styles.exercisePill}
                onPress={() => navigation.navigate('Workout', { exerciseId: ex.id })}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={[`${ex.accentColor}18`, Colors.card]}
                  style={styles.exercisePillGrad}
                >
                  <View style={[styles.exercisePillIcon, { backgroundColor: `${ex.accentColor}18` }]}>
                    <ExerciseIcon exerciseId={ex.id} size={28} color={ex.accentColor} />
                  </View>
                  <Text style={styles.exercisePillName}>{ex.name}</Text>
                  <View style={[styles.exercisePillBadge, { backgroundColor: `${ex.accentColor}18` }]}>
                    <Text style={[styles.exercisePillBadgeText, { color: ex.accentColor }]}>{ex.difficulty}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Recent sessions */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => navigation.getParent()?.navigate('AnalyticsTab')}>
              <Text style={styles.sectionLink}>History</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sessionsList}>
            {recentSessions.map((session, index) => {
              const ex = EXERCISES[session.exerciseId];
              const grade = getScoreGrade(session.score);
              return (
                <View key={session.id} style={styles.sessionCard}>
                  <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.sessionCardGrad}>
                    <View style={[styles.sessionIconBox, { backgroundColor: `${ex.accentColor}18` }]}>
                      <ExerciseIcon exerciseId={session.exerciseId} size={24} color={ex.accentColor} />
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionName}>{ex.name}</Text>
                      <Text style={styles.sessionMeta}>{session.reps} reps · {formatDuration(session.duration)} · {session.date}</Text>
                    </View>
                    <View style={styles.sessionScore}>
                      <Text style={[styles.sessionGrade, { color: grade.color }]}>{grade.grade}</Text>
                      <Text style={styles.sessionScoreNum}>{session.score}</Text>
                    </View>
                  </LinearGradient>
                </View>
              );
            })}
          </View>

          {/* AI Coach teaser */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.getParent()?.navigate('CoachTab')}
          >
            <LinearGradient
              colors={['#1A0D00', '#120900']}
              style={styles.coachTeaser}
            >
              <LinearGradient
                colors={['rgba(255,138,0,0.15)', 'transparent']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.coachTeaserContent}>
                <Text style={styles.coachTeaserEmoji}>🤖</Text>
                <View>
                  <Text style={styles.coachTeaserTitle}>AI Coach is ready</Text>
                  <Text style={styles.coachTeaserSub}>Ask about form, goals, or get motivated</Text>
                </View>
                <Text style={styles.coachArrow}>›</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 14, color: Colors.textMuted, fontWeight: '500', letterSpacing: 0.3 },
  username: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  avatarBtn: { shadowColor: Colors.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.cyanGlow },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCardFlex: { flex: 1 },
  ctaBannerWrapper: {
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.cyanGlow,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  ctaBanner: { borderRadius: BorderRadius.xxl, padding: 24, overflow: 'hidden' },
  ctaGlowLine: { position: 'absolute', top: 0, left: 24, right: 24, height: 1, backgroundColor: Colors.cyanGlow },
  ctaContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  ctaOverline: { fontSize: 10, fontWeight: '700', color: Colors.cyan, letterSpacing: 2, marginBottom: 6 },
  ctaTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, lineHeight: 32, marginBottom: 12 },
  ctaChip: { backgroundColor: Colors.cyanDim, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyanGlow },
  ctaChipText: { fontSize: 12, color: Colors.cyan, fontWeight: '600' },
  ctaRight: { marginLeft: 16 },
  ctaArrow: { alignSelf: 'flex-end' },
  ctaArrowText: { fontSize: 15, fontWeight: '700', color: Colors.cyan },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  sectionLink: { fontSize: 14, color: Colors.cyan, fontWeight: '600' },
  exerciseScrollContent: { paddingRight: 20, gap: 12, marginBottom: 24 },
  exercisePill: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    width: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  exercisePillGrad: { padding: 16, alignItems: 'center', gap: 10 },
  exercisePillIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  exercisePillName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  exercisePillBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  exercisePillBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sessionsList: { gap: 10, marginBottom: 20 },
  sessionCard: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  sessionCardGrad: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  sessionIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  sessionMeta: { fontSize: 12, color: Colors.textMuted },
  sessionScore: { alignItems: 'center' },
  sessionGrade: { fontSize: 20, fontWeight: '900' },
  sessionScoreNum: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  coachTeaser: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.orangeGlow,
  },
  coachTeaserContent: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  coachTeaserEmoji: { fontSize: 28 },
  coachTeaserTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  coachTeaserSub: { fontSize: 12, color: Colors.textMuted },
  coachArrow: { fontSize: 24, color: Colors.orange, marginLeft: 'auto' },
});
