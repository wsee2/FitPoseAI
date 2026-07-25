import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius } from '../theme';
import { useApp } from '../context/AppContext';
import { EXERCISES, formatDuration } from '../data/exercises';
import { ExerciseIcon } from '../components/ui/ExerciseIcon';
import { MYT_OFFSET_MS, todayInMYT, mytDateStr, parseMYTDateStr } from '../utils/mytDate';
import type { ScoreDetailNavigationProp, ScoreDetailRouteProp } from '../navigation/types';

const { width } = Dimensions.get('window');
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// All Date values in this screen are MYT-shifted (see ../utils/mytDate) — always use the
// UTC getters/setters (getUTCDate, setUTCDate, ...), never the local ones.
function fmtShort(d: Date): string {
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

interface DayChip { key: string; dayLabel: string; dateLabel: string; dateStr: string; }
interface WeekChip { key: string; label: string; subLabel: string; startStr: string; endStr: string; }

type Props = { navigation: ScoreDetailNavigationProp; route: ScoreDetailRouteProp; };

export default function ScoreDetailScreen({ navigation, route }: Props) {
  const { mode } = route.params;
  const { workoutHistory, authUser } = useApp();
  const insets = useSafeAreaInsets();

  const today = useMemo(() => todayInMYT(), []);

  // First day of history: the earlier of the account's registration date and its
  // earliest recorded session (never trust just one signal — a stale/late-hydrating
  // auth metadata timestamp must not hide older sessions that already exist).
  // Clamped to <= today. Both candidates are normalized into the MYT-shifted domain
  // (see ../utils/mytDate) before comparing.
  const startDate = useMemo(() => {
    const candidates: number[] = [];
    if (authUser?.metadata?.creationTime) {
      const t = new Date(authUser.metadata.creationTime).getTime();
      if (!isNaN(t)) candidates.push(t + MYT_OFFSET_MS);
    }
    if (workoutHistory.length > 0) {
      const earliest = workoutHistory.reduce(
        (min, s) => (s.date < min ? s.date : min),
        workoutHistory[0]!.date
      );
      candidates.push(parseMYTDateStr(earliest).getTime());
    }
    const d = candidates.length > 0 ? new Date(Math.min(...candidates)) : new Date(today);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() > today.getTime() ? today : d;
  }, [authUser, workoutHistory, today]);

  // Daily: every day from registration to today (oldest → newest)
  const dayChips = useMemo((): DayChip[] => {
    const LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totalDays = Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1;
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      return {
        key: mytDateStr(d),
        dayLabel: LABELS[d.getUTCDay()]!,
        dateLabel: `${d.getUTCDate()}`,
        dateStr: mytDateStr(d),
      };
    });
  }, [today, startDate]);

  // Weekly: every rolling 7-day block from registration week to the current week (oldest → newest)
  const weekChips = useMemo((): WeekChip[] => {
    const totalWeeks = Math.floor((today.getTime() - startDate.getTime()) / (7 * 86400000)) + 1;
    return Array.from({ length: totalWeeks }, (_, i) => {
      const wEnd = new Date(today);
      wEnd.setUTCDate(wEnd.getUTCDate() - (totalWeeks - 1 - i) * 7);
      const wStart = new Date(wEnd);
      wStart.setUTCDate(wStart.getUTCDate() - 6);
      const weeksAgo = totalWeeks - 1 - i;
      const label = weeksAgo === 0 ? 'This Wk' : weeksAgo === 1 ? 'Last Wk' : `${weeksAgo} wks ago`;
      return {
        key: `w${i}`,
        label,
        subLabel: `${fmtShort(wStart)}–${wStart.getUTCMonth() === wEnd.getUTCMonth() ? wEnd.getUTCDate() : fmtShort(wEnd)}`,
        startStr: mytDateStr(wStart),
        endStr: mytDateStr(wEnd),
      };
    });
  }, [today, startDate]);

  const [selectedDay, setSelectedDay] = useState<string>(dayChips[dayChips.length - 1]!.dateStr);
  const [selectedWeek, setSelectedWeek] = useState<number>(weekChips.length - 1);

  const selectedSessions = useMemo(() => {
    if (mode === 'weekly') {
      return workoutHistory.filter(s => s.date === selectedDay);
    }
    const chip = weekChips[selectedWeek]!;
    return workoutHistory.filter(s => s.date >= chip.startStr && s.date <= chip.endStr);
  }, [mode, workoutHistory, selectedDay, selectedWeek, weekChips]);

  const avgScore = selectedSessions.length > 0
    ? Math.round(selectedSessions.reduce((s, w) => s + w.score, 0) / selectedSessions.length)
    : null;

  const selectedLabel = useMemo(() => {
    if (mode === 'weekly') {
      const chip = dayChips.find(c => c.dateStr === selectedDay);
      if (!chip) return '';
      const d = parseMYTDateStr(selectedDay);
      return `${chip.dayLabel}, ${fmtShort(d)}`;
    }
    const chip = weekChips[selectedWeek]!;
    return `${chip.label} · ${chip.subLabel}`;
  }, [mode, selectedDay, selectedWeek, dayChips, weekChips]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'weekly' ? 'Daily Breakdown' : 'Weekly Breakdown'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Chip picker */}
        {mode === 'weekly' ? (
          <FlatList
            key="day-chips"
            horizontal
            data={dayChips}
            keyExtractor={(chip) => chip.key}
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
            initialScrollIndex={Math.max(0, dayChips.length - 1)}
            getItemLayout={(_, index) => ({
              length: DAY_CHIP_LENGTH, offset: DAY_CHIP_LENGTH * index, index,
            })}
            renderItem={({ item: chip }) => {
              const active = chip.dateStr === selectedDay;
              return (
                <TouchableOpacity
                  onPress={() => setSelectedDay(chip.dateStr)}
                  style={[styles.dayChip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipDayLabel, active && styles.chipLabelActive]}>{chip.dayLabel}</Text>
                  <Text style={[styles.chipDateLabel, active && styles.chipDateActive]}>{chip.dateLabel}</Text>
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <FlatList
            key="week-chips"
            horizontal
            data={weekChips}
            keyExtractor={(chip) => chip.key}
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsRow}
            initialScrollIndex={Math.max(0, weekChips.length - 1)}
            getItemLayout={(_, index) => ({
              length: WEEK_CHIP_LENGTH, offset: WEEK_CHIP_LENGTH * index, index,
            })}
            renderItem={({ item: chip, index: i }) => {
              const active = i === selectedWeek;
              return (
                <TouchableOpacity
                  onPress={() => setSelectedWeek(i)}
                  style={[styles.weekChip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipDayLabel, active && styles.chipLabelActive]}>{chip.label}</Text>
                  <Text style={[styles.chipDateLabel, active && styles.chipDateActive]}>{chip.subLabel}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Period label + avg score */}
        <View style={styles.periodHeader}>
          <Text style={styles.periodLabel}>{selectedLabel}</Text>
          {avgScore !== null && (
            <View style={styles.avgBadge}>
              <Text style={styles.avgBadgeLabel}>Avg</Text>
              <Text style={styles.avgBadgeScore}>{avgScore}</Text>
            </View>
          )}
        </View>

        {/* Session list */}
        {selectedSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No sessions</Text>
            <Text style={styles.emptySubtitle}>
              {mode === 'weekly' ? 'No workout recorded for this day.' : 'No workouts recorded for this week.'}
            </Text>
          </View>
        ) : (
          <View style={styles.sessionList}>
            {selectedSessions.map((session) => {
              const ex = EXERCISES[session.exerciseId as keyof typeof EXERCISES];
              if (!ex) return null;
              const scoreColor = session.score >= 80 ? Colors.success : session.score >= 60 ? Colors.gold : Colors.orange;
              return (
                <View key={session.id} style={styles.sessionRow}>
                  <View style={styles.sessionIconWrap}>
                    <ExerciseIcon exerciseId={session.exerciseId as any} size={32} color={ex.accentColor} />
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionName}>{ex.name}</Text>
                    <View style={styles.sessionMeta}>
                      <Text style={styles.sessionMetaText}>{session.reps} reps</Text>
                      <Text style={styles.sessionMetaDot}>·</Text>
                      <Text style={styles.sessionMetaText}>{formatDuration(session.duration)}</Text>
                      {session.calories > 0 && (
                        <>
                          <Text style={styles.sessionMetaDot}>·</Text>
                          <Text style={styles.sessionMetaText}>{session.calories} kcal</Text>
                        </>
                      )}
                    </View>
                    <Text style={[styles.sessionFormQuality, { color: ex.accentColor }]}>{session.formQuality}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: `${scoreColor}22` }]}>
                    <Text style={[styles.scoreValue, { color: scoreColor }]}>{session.score}</Text>
                    <Text style={styles.scoreLabel}>score</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CHIP_WIDTH = (width - 40 - 24) / 4;
const CHIP_GAP = 8;
const DAY_CHIP_LENGTH = CHIP_WIDTH + CHIP_GAP;
const WEEK_CHIP_WIDTH = (width - 40 - 24) / 3;
const WEEK_CHIP_LENGTH = WEEK_CHIP_WIDTH + CHIP_GAP;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: Colors.textPrimary, fontWeight: '300' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  chipsScroll: { marginBottom: 20 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dayChip: {
    width: CHIP_WIDTH, paddingVertical: 10, borderRadius: BorderRadius.lg,
    alignItems: 'center', backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
  },
  weekChip: {
    width: WEEK_CHIP_WIDTH, paddingVertical: 12, borderRadius: BorderRadius.lg,
    alignItems: 'center', backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.cyanDim, borderColor: Colors.cyan },
  chipDayLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.3 },
  chipLabelActive: { color: Colors.cyan },
  chipDateLabel: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginTop: 2 },
  chipDateActive: { color: Colors.textPrimary },
  periodHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  periodLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  avgBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.cyanDim, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.cyan,
  },
  avgBadgeLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  avgBadgeScore: { fontSize: 18, fontWeight: '900', color: Colors.cyan },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textSecondary },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  sessionList: { gap: 12 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: BorderRadius.xl,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  sessionIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center',
  },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  sessionMetaText: { fontSize: 12, color: Colors.textMuted },
  sessionMetaDot: { fontSize: 12, color: Colors.textMuted },
  sessionFormQuality: { fontSize: 11, fontWeight: '700' },
  scoreBadge: { alignItems: 'center', padding: 10, borderRadius: 12, minWidth: 52 },
  scoreValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  scoreLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 1 },
});
