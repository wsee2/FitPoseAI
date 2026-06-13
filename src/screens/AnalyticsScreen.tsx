import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Line, Path, Circle, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, BorderRadius, Typography } from '../theme';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useApp } from '../context/AppContext';
import { EXERCISES, WEEKLY_DATA, getScoreGrade } from '../data/exercises';
import type { AnalyticsStackParamList } from '../navigation/types';

const { width } = Dimensions.get('window');
const CHART_W = width - 40;
const CHART_H = 140;

type Props = { navigation: NativeStackNavigationProp<AnalyticsStackParamList, 'Analytics'> };

type Tab = 'weekly' | 'monthly';

export default function AnalyticsScreen({ navigation }: Props) {
  const { workoutHistory, profile } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('weekly');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const totalReps = workoutHistory.reduce((s, w) => s + w.reps, 0);
  const avgScore = Math.round(workoutHistory.reduce((s, w) => s + w.score, 0) / Math.max(workoutHistory.length, 1));
  const totalTime = workoutHistory.reduce((s, w) => s + w.duration, 0);
  const totalCalories = workoutHistory.reduce((s, w) => s + w.calories, 0);

  // Weekly bar chart
  const data = WEEKLY_DATA;
  const maxScore = Math.max(...data.map(d => d.score), 1);
  const barW = (CHART_W - 40) / data.length;

  // Exercise breakdown
  const exerciseCounts = workoutHistory.reduce<Record<string, number>>((acc, s) => {
    acc[s.exerciseId] = (acc[s.exerciseId] ?? 0) + 1;
    return acc;
  }, {});
  const exerciseEntries = Object.entries(exerciseCounts).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.overline}>YOUR PROGRESS</Text>
              <Text style={styles.title}>Analytics</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('WorkoutHistory')} style={styles.historyBtn}>
              <Text style={styles.historyBtnText}>History</Text>
            </TouchableOpacity>
          </View>

          {/* Big stats */}
          <View style={styles.bigStatsRow}>
            <View style={styles.bigStatCard}>
              <LinearGradient colors={[Colors.cyanDim, Colors.card]} style={styles.bigStatGrad}>
                <Text style={[styles.bigStatValue, { color: Colors.cyan }]}>{avgScore}</Text>
                <Text style={styles.bigStatLabel}>Avg Score</Text>
                <View style={[styles.bigStatBadge, { backgroundColor: Colors.cyanDim }]}>
                  <Text style={[styles.bigStatBadgeText, { color: Colors.cyan }]}>↑ 8 pts</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.bigStatCard}>
              <LinearGradient colors={[Colors.goldDim, Colors.card]} style={styles.bigStatGrad}>
                <Text style={[styles.bigStatValue, { color: Colors.gold }]}>{profile?.streak ?? 14}</Text>
                <Text style={styles.bigStatLabel}>Day Streak</Text>
                <View style={[styles.bigStatBadge, { backgroundColor: Colors.goldDim }]}>
                  <Text style={[styles.bigStatBadgeText, { color: Colors.gold }]}>🔥 Personal best</Text>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Quick stats */}
          <View style={styles.quickStatsRow}>
            {[
              { label: 'Total Reps', value: totalReps.toLocaleString(), color: Colors.orange },
              { label: 'Sessions', value: workoutHistory.length.toString(), color: Colors.cyan },
              { label: 'Calories', value: totalCalories.toLocaleString(), color: Colors.success },
              { label: 'Minutes', value: Math.round(totalTime / 60).toString(), color: Colors.gold },
            ].map((stat, i) => (
              <View key={i} style={styles.qStat}>
                <Text style={[styles.qStatValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.qStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Tab toggle */}
          <View style={styles.tabRow}>
            {(['weekly', 'monthly'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                  {t === 'weekly' ? 'This Week' : 'This Month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bar chart */}
          <View style={styles.chartCard}>
            <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.chartGrad}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Daily Score</Text>
                <Text style={styles.chartSubtitle}>Last 7 days</Text>
              </View>
              <Svg width={CHART_W - 32} height={CHART_H + 30} viewBox={`0 0 ${CHART_W - 32} ${CHART_H + 30}`}>
                <Defs>
                  <SvgGrad id="barG" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor={Colors.cyan} stopOpacity="0.8" />
                    <Stop offset="100%" stopColor={Colors.cyan} stopOpacity="0.2" />
                  </SvgGrad>
                </Defs>
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map((v) => {
                  const y = CHART_H - (v / 100) * CHART_H;
                  return (
                    <Line key={v} x1="0" y1={y} x2={CHART_W - 32} y2={y}
                      stroke={Colors.border} strokeWidth="0.5" />
                  );
                })}
                {/* Bars */}
                {data.map((d, i) => {
                  const bh = d.score > 0 ? (d.score / 100) * CHART_H : 3;
                  const x = i * barW + barW * 0.2;
                  const w = barW * 0.6;
                  return (
                    <React.Fragment key={i}>
                      <Rect
                        x={x} y={CHART_H - bh} width={w} height={bh}
                        rx={4} fill={d.score > 0 ? "url(#barG)" : Colors.border}
                      />
                      <SvgText
                        x={x + w / 2} y={CHART_H + 20}
                        fontSize="10" fill={Colors.textMuted} textAnchor="middle"
                      >
                        {d.day}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </LinearGradient>
          </View>

          {/* Score rings */}
          <View style={styles.ringsSection}>
            <Text style={styles.sectionTitle}>This Week's Performance</Text>
            <View style={styles.ringsRow}>
              <View style={styles.ringItem}>
                <ProgressRing progress={avgScore} size={90} strokeWidth={8} color={Colors.cyan} label={`${avgScore}`} sublabel="score" />
                <Text style={styles.ringLabel}>Avg Score</Text>
              </View>
              <View style={styles.ringItem}>
                <ProgressRing progress={Math.round((workoutHistory.filter(s => s.formQuality === 'Excellent' || s.formQuality === 'Good').length / Math.max(workoutHistory.length, 1)) * 100)}
                  size={90} strokeWidth={8} color={Colors.success}
                  label={`${Math.round((workoutHistory.filter(s => s.formQuality === 'Excellent' || s.formQuality === 'Good').length / Math.max(workoutHistory.length, 1)) * 100)}%`}
                  sublabel="good form" />
                <Text style={styles.ringLabel}>Form Rate</Text>
              </View>
              <View style={styles.ringItem}>
                <ProgressRing progress={Math.min(100, workoutHistory.length * 14)}
                  size={90} strokeWidth={8} color={Colors.orange}
                  label={workoutHistory.length.toString()} sublabel="sessions" />
                <Text style={styles.ringLabel}>Consistency</Text>
              </View>
            </View>
          </View>

          {/* Exercise breakdown */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Exercise Breakdown</Text>
          </View>
          <View style={styles.exerciseList}>
            {exerciseEntries.map(([exId, count], i) => {
              const ex = EXERCISES[exId as keyof typeof EXERCISES];
              const pct = Math.round((count / Math.max(workoutHistory.length, 1)) * 100);
              return (
                <View key={exId} style={styles.exBreakRow}>
                  <View style={[styles.exBreakDot, { backgroundColor: ex.accentColor }]} />
                  <Text style={styles.exBreakName}>{ex.name}</Text>
                  <View style={styles.exBreakBarTrack}>
                    <View style={[styles.exBreakBarFill, { width: `${pct}%`, backgroundColor: ex.accentColor }]} />
                  </View>
                  <Text style={[styles.exBreakPct, { color: ex.accentColor }]}>{pct}%</Text>
                </View>
              );
            })}
          </View>

          {/* Calendar heatmap placeholder */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Activity Calendar</Text>
            <Text style={styles.sectionSub}>June 2026</Text>
          </View>
          <View style={styles.calendarCard}>
            <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.calendarGrad}>
              <View style={styles.calGrid}>
                {Array.from({ length: 30 }, (_, i) => {
                  const hasWorkout = workoutHistory.some(s => s.date.endsWith(`-${(i + 1).toString().padStart(2, '0')}`));
                  const intensity = hasWorkout ? Math.random() : 0;
                  return (
                    <View key={i} style={[
                      styles.calCell,
                      hasWorkout ? { backgroundColor: `${Colors.cyan}${Math.round(intensity * 80 + 40).toString(16).padStart(2, '0')}` } : { backgroundColor: Colors.border },
                    ]}>
                      <Text style={styles.calCellText}>{i + 1}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.calLegend}>
                <Text style={styles.calLegendText}>Less</Text>
                {[0.2, 0.4, 0.6, 0.8, 1].map((o, i) => (
                  <View key={i} style={[styles.calLegendDot, { backgroundColor: `${Colors.cyan}${Math.round(o * 255).toString(16).padStart(2, '0')}` }]} />
                ))}
                <Text style={styles.calLegendText}>More</Text>
              </View>
            </LinearGradient>
          </View>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  overline: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8 },
  historyBtn: { backgroundColor: Colors.cyanDim, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.cyanGlow },
  historyBtnText: { color: Colors.cyan, fontSize: 13, fontWeight: '700' },
  bigStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  bigStatCard: { flex: 1, borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  bigStatGrad: { padding: 20, alignItems: 'center', gap: 6 },
  bigStatValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  bigStatLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  bigStatBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  bigStatBadgeText: { fontSize: 11, fontWeight: '700' },
  quickStatsRow: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20,
    justifyContent: 'space-around',
  },
  qStat: { alignItems: 'center' },
  qStatValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  qStatLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 3, letterSpacing: 0.3 },
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: BorderRadius.full,
    padding: 4, marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: BorderRadius.full, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.cardElevated },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabBtnTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  chartCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  chartGrad: { padding: 16 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  chartSubtitle: { fontSize: 12, color: Colors.textMuted },
  ringsSection: { marginBottom: 20 },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: 20, borderWidth: 1, borderColor: Colors.border },
  ringItem: { alignItems: 'center', gap: 10 },
  ringLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },
  sectionSub: { fontSize: 13, color: Colors.textMuted },
  exerciseList: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12, marginBottom: 20 },
  exBreakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exBreakDot: { width: 8, height: 8, borderRadius: 4 },
  exBreakName: { width: 70, fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  exBreakBarTrack: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  exBreakBarFill: { height: '100%', borderRadius: 3 },
  exBreakPct: { width: 36, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  calendarCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  calendarGrad: { padding: 16 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calCell: { width: (CHART_W - 32 - 29 * 4) / 6, height: (CHART_W - 32 - 29 * 4) / 6, borderRadius: 4, alignItems: 'center', justifyContent: 'center', minWidth: 32, minHeight: 32 },
  calCellText: { fontSize: 8, color: Colors.textMuted },
  calLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 10 },
  calLegendText: { fontSize: 10, color: Colors.textMuted },
  calLegendDot: { width: 10, height: 10, borderRadius: 2 },
});
