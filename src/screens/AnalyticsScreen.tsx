import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, BorderRadius } from '../theme';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useApp } from '../context/AppContext';
import { EXERCISES } from '../data/exercises';
import { todayInMYT, mytDateStr } from '../utils/mytDate';
import type { AnalyticsStackParamList } from '../navigation/types';

const { width } = Dimensions.get('window');
const CHART_W = width - 40;
const CHART_H = 140;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Dates here are MYT-shifted (see ../utils/mytDate) — always use the UTC getters/setters.
const toDateStr = mytDateStr;

type Props = { navigation: NativeStackNavigationProp<AnalyticsStackParamList, 'Analytics'> };
type Tab = 'weekly' | 'monthly';
interface ChartBar { label: string; score: number; }

export default function AnalyticsScreen({ navigation }: Props) {
  const { workoutHistory, profile } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('weekly');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const today = useMemo(() => todayInMYT(), []);

  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 6);
    return toDateStr(d);
  }, [today]);

  const monthStart = useMemo(() => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 27);
    return toDateStr(d);
  }, [today]);

  const weeklySessions = useMemo(
    () => workoutHistory.filter(s => s.date >= weekStart),
    [workoutHistory, weekStart]
  );

  const monthlySessions = useMemo(
    () => workoutHistory.filter(s => s.date >= monthStart),
    [workoutHistory, monthStart]
  );

  const periodSessions = tab === 'weekly' ? weeklySessions : monthlySessions;

  const avgScore = Math.round(
    periodSessions.reduce((s, w) => s + w.score, 0) / Math.max(periodSessions.length, 1)
  );
  const totalReps = periodSessions.reduce((s, w) => s + w.reps, 0);
  const totalCalories = periodSessions.reduce((s, w) => s + w.calories, 0);
  const totalTime = periodSessions.reduce((s, w) => s + w.duration, 0);

  const goodFormPct = useMemo(() => {
    const good = periodSessions.filter(s => s.formQuality === 'Excellent' || s.formQuality === 'Good').length;
    return Math.round((good / Math.max(periodSessions.length, 1)) * 100);
  }, [periodSessions]);

  const allTimeAvgScore = Math.round(
    workoutHistory.reduce((s, w) => s + w.score, 0) / Math.max(workoutHistory.length, 1)
  );

  const weeklyChartData = useMemo((): ChartBar[] =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      const dateStr = toDateStr(d);
      const sessions = workoutHistory.filter(s => s.date === dateStr);
      const score = sessions.length > 0
        ? Math.round(sessions.reduce((s, w) => s + w.score, 0) / sessions.length)
        : 0;
      return { label: DAY_LABELS[d.getUTCDay()]!, score };
    }),
    [workoutHistory, today]
  );

  const monthlyChartData = useMemo((): ChartBar[] =>
    Array.from({ length: 4 }, (_, i) => {
      const wEnd = new Date(today);
      wEnd.setUTCDate(wEnd.getUTCDate() - (3 - i) * 7);
      const wStart = new Date(wEnd);
      wStart.setUTCDate(wStart.getUTCDate() - 6);
      const sessions = workoutHistory.filter(s => s.date >= toDateStr(wStart) && s.date <= toDateStr(wEnd));
      const score = sessions.length > 0
        ? Math.round(sessions.reduce((s, w) => s + w.score, 0) / sessions.length)
        : 0;
      return { label: `W${i + 1}`, score };
    }),
    [workoutHistory, today]
  );

  const chartData = tab === 'weekly' ? weeklyChartData : monthlyChartData;
  const barW = (CHART_W - 32) / chartData.length;

  const exerciseCounts = useMemo(() => {
    const counts = workoutHistory.reduce<Record<string, number>>((acc, s) => {
      acc[s.exerciseId] = (acc[s.exerciseId] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [workoutHistory]);

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
            <Text style={styles.overline}>YOUR PROGRESS</Text>
            <Text style={styles.title}>Analytics</Text>
          </View>

          {/* Big stats */}
          <View style={styles.bigStatsRow}>
            <View style={styles.bigStatCard}>
              <LinearGradient colors={[Colors.cyanDim, Colors.card]} style={styles.bigStatGrad}>
                <Text style={[styles.bigStatValue, { color: Colors.cyan }]}>{allTimeAvgScore || '—'}</Text>
                <Text style={styles.bigStatLabel}>Avg Score</Text>
                <View style={[styles.bigStatBadge, { backgroundColor: Colors.cyanDim }]}>
                  <Text style={[styles.bigStatBadgeText, { color: Colors.cyan }]}>All time</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.bigStatCard}>
              <LinearGradient colors={[Colors.goldDim, Colors.card]} style={styles.bigStatGrad}>
                <Text style={[styles.bigStatValue, { color: Colors.gold }]}>{profile?.streak ?? 0}</Text>
                <Text style={styles.bigStatLabel}>Day Streak</Text>
                <View style={[styles.bigStatBadge, { backgroundColor: Colors.goldDim }]}>
                  <Text style={[styles.bigStatBadgeText, { color: Colors.gold }]}>Keep going</Text>
                </View>
              </LinearGradient>
            </View>
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

          {/* Period stats */}
          <View style={styles.quickStatsRow}>
            {[
              { label: 'Avg Score', value: periodSessions.length > 0 ? avgScore.toString() : '—', color: Colors.cyan },
              { label: 'Total Reps', value: totalReps.toLocaleString(), color: Colors.orange },
              { label: 'Sessions', value: periodSessions.length.toString(), color: Colors.success },
              { label: 'Calories', value: totalCalories.toLocaleString(), color: Colors.gold },
              { label: 'Minutes', value: Math.round(totalTime / 60).toString(), color: Colors.textSecondary },
            ].map((stat, i) => (
              <View key={i} style={styles.qStat}>
                <Text style={[styles.qStatValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.qStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Bar chart — tappable */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ScoreDetail', { mode: tab })}
          >
            <View style={styles.chartCard}>
              <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.chartGrad}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>
                      {tab === 'weekly' ? 'Daily Score' : 'Weekly Score'}
                    </Text>
                    <Text style={styles.chartSubtitle}>
                      {tab === 'weekly' ? 'Last 7 days' : 'Last 4 weeks'}
                    </Text>
                  </View>
                  <Text style={styles.chartTapHint}>Tap to drill down →</Text>
                </View>
                <Svg width={CHART_W - 32} height={CHART_H + 30} viewBox={`0 0 ${CHART_W - 32} ${CHART_H + 30}`}>
                  <Defs>
                    <SvgGrad id="barG" x1="0%" y1="0%" x2="0%" y2="100%">
                      <Stop offset="0%" stopColor={Colors.cyan} stopOpacity="0.8" />
                      <Stop offset="100%" stopColor={Colors.cyan} stopOpacity="0.2" />
                    </SvgGrad>
                  </Defs>
                  {[0, 25, 50, 75, 100].map((v) => {
                    const y = CHART_H - (v / 100) * CHART_H;
                    return (
                      <Line key={v} x1="0" y1={y} x2={CHART_W - 32} y2={y}
                        stroke={Colors.border} strokeWidth="0.5" />
                    );
                  })}
                  {chartData.map((d, i) => {
                    const bh = d.score > 0 ? (d.score / 100) * CHART_H : 3;
                    const x = i * barW + barW * 0.15;
                    const bw = barW * 0.7;
                    return (
                      <React.Fragment key={i}>
                        <Rect
                          x={x} y={CHART_H - bh} width={bw} height={bh}
                          rx={4} fill={d.score > 0 ? 'url(#barG)' : Colors.border}
                        />
                        <SvgText
                          x={x + bw / 2} y={CHART_H + 20}
                          fontSize="10" fill={Colors.textMuted} textAnchor="middle"
                        >
                          {d.label}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </LinearGradient>
            </View>
          </TouchableOpacity>

          {/* Score rings */}
          <View style={styles.ringsSection}>
            <Text style={styles.sectionTitle}>
              {tab === 'weekly' ? "This Week's Performance" : "This Month's Performance"}
            </Text>
            <View style={styles.ringsRow}>
              <View style={styles.ringItem}>
                <ProgressRing
                  progress={periodSessions.length > 0 ? avgScore : 0}
                  size={90} strokeWidth={8} color={Colors.cyan}
                  label={periodSessions.length > 0 ? `${avgScore}` : '—'}
                  sublabel="score"
                />
                <Text style={styles.ringLabel}>Avg Score</Text>
              </View>
              <View style={styles.ringItem}>
                <ProgressRing
                  progress={goodFormPct} size={90} strokeWidth={8} color={Colors.success}
                  label={periodSessions.length > 0 ? `${goodFormPct}%` : '—'}
                  sublabel="good form"
                />
                <Text style={styles.ringLabel}>Form Rate</Text>
              </View>
              <View style={styles.ringItem}>
                <ProgressRing
                  progress={Math.min(100, periodSessions.length * 14)}
                  size={90} strokeWidth={8} color={Colors.orange}
                  label={periodSessions.length.toString()} sublabel="sessions"
                />
                <Text style={styles.ringLabel}>Consistency</Text>
              </View>
            </View>
          </View>

          {/* Exercise breakdown */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Exercise Breakdown</Text>
            <TouchableOpacity onPress={() => navigation.navigate('WorkoutHistory')}>
              <Text style={styles.chartTapHint}>View All →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.exerciseList}>
            {exerciseCounts.length === 0 ? (
              <Text style={styles.emptyText}>No sessions yet</Text>
            ) : exerciseCounts.map(([exId, count]) => {
              const ex = EXERCISES[exId as keyof typeof EXERCISES];
              if (!ex) return null;
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

          {/* Activity calendar */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Activity Calendar</Text>
            <Text style={styles.sectionSub}>
              {today.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </Text>
          </View>
          <View style={styles.calendarCard}>
            <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.calendarGrad}>
              <View style={styles.calGrid}>
                {Array.from({ length: 30 }, (_, i) => {
                  const dayStr = (i + 1).toString().padStart(2, '0');
                  const count = workoutHistory.filter(s => s.date.endsWith(`-${dayStr}`)).length;
                  const intensity = Math.min(count / 3, 1);
                  return (
                    <View key={i} style={[
                      styles.calCell,
                      count > 0
                        ? { backgroundColor: `${Colors.cyan}${Math.round(intensity * 180 + 40).toString(16).padStart(2, '0')}` }
                        : { backgroundColor: Colors.border },
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
  header: { marginBottom: 24 },
  overline: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8 },
  bigStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  bigStatCard: { flex: 1, borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  bigStatGrad: { padding: 20, alignItems: 'center', gap: 6 },
  bigStatValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  bigStatLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  bigStatBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  bigStatBadgeText: { fontSize: 11, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: BorderRadius.full,
    padding: 4, marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: BorderRadius.full, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.cardElevated },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabBtnTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  quickStatsRow: {
    flexDirection: 'row', backgroundColor: Colors.card, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 20,
    justifyContent: 'space-around',
  },
  qStat: { alignItems: 'center' },
  qStatValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  qStatLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', marginTop: 3, letterSpacing: 0.3 },
  chartCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  chartGrad: { padding: 16 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  chartSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chartTapHint: { fontSize: 11, color: Colors.cyan, fontWeight: '600' },
  ringsSection: { marginBottom: 20 },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: 20, borderWidth: 1, borderColor: Colors.border },
  ringItem: { alignItems: 'center', gap: 10 },
  ringLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },
  sectionSub: { fontSize: 13, color: Colors.textMuted },
  exerciseList: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12, marginBottom: 20 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
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
