import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, BorderRadius } from '../theme';
import { ExerciseIcon } from '../components/ui/ExerciseIcon';
import { useApp } from '../context/AppContext';
import { EXERCISES, formatDuration, getScoreGrade, ExerciseId } from '../data/exercises';
import { getHistory, type WorkoutRecord } from '../services/firebaseWorkout';
import type { AnalyticsStackParamList } from '../navigation/types';

type Props = { navigation: NativeStackNavigationProp<AnalyticsStackParamList, 'WorkoutHistory'> };

const FILTERS: { id: ExerciseId | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'squat', label: 'Squat' },
  { id: 'pushup', label: 'Push-up' },
  { id: 'lunge', label: 'Lunge' },
  { id: 'plank', label: 'Plank' },
  { id: 'situp', label: 'Sit-up' },
];

export default function WorkoutHistoryScreen({ navigation }: Props) {
  const { workoutHistory } = useApp();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ExerciseId | 'all'>('all');
  const [cloudHistory, setCloudHistory] = useState<WorkoutRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHistory().then((records) => {
      if (!cancelled) setCloudHistory(records);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = workoutHistory.filter(s => {
    const ex = EXERCISES[s.exerciseId];
    const matchesFilter = filter === 'all' || s.exerciseId === filter;
    const matchesSearch = search === '' || ex.name.toLowerCase().includes(search.toLowerCase()) || s.date.includes(search);
    return matchesFilter && matchesSearch;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {});
  const groupedEntries = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  const formatDate = (d: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (d === today) return 'Today';
    if (d === yesterday) return 'Yesterday';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout History</Text>
        <Text style={styles.countBadge}>{workoutHistory.length}</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search workouts…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Cloud sync */}
      <View style={styles.cloudSection}>
        <Text style={styles.cloudTitle}>Cloud Sync · Last 5</Text>
        {cloudHistory === null ? (
          <View style={styles.cloudLoading}>
            <ActivityIndicator size="small" color={Colors.cyan} />
          </View>
        ) : cloudHistory.length === 0 ? (
          <Text style={styles.cloudEmpty}>No cloud-synced workouts yet</Text>
        ) : (
          <View style={styles.cloudList}>
            {[...cloudHistory].reverse().map((record, i) => (
              <View
                key={`${record.timestamp}-${i}`}
                style={[
                  styles.cloudRow,
                  i < cloudHistory.length - 1 && styles.sessionCardBorderBottom,
                ]}
              >
                <Text style={styles.cloudExercise}>{record.exercise}</Text>
                <Text style={styles.cloudMeta}>{record.reps} reps · {record.score} pts</Text>
                <Text style={styles.cloudTimestamp}>{record.timestamp}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Filters */}
      <FlatList
        data={FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setFilter(item.id)}
            style={[styles.filterChip, filter === item.id && styles.filterChipActive]}
          >
            {filter === item.id && item.id !== 'all' && (
              <ExerciseIcon exerciseId={item.id as ExerciseId} size={14} color={Colors.cyan} />
            )}
            <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        style={styles.filtersList}
      />

      {/* Sessions list */}
      <FlatList
        data={groupedEntries}
        keyExtractor={item => item[0]}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: [date, sessions] }) => (
          <View style={styles.dateGroup}>
            <Text style={styles.dateLabel}>{formatDate(date)}</Text>
            <View style={styles.sessionGroup}>
              {sessions.map((session, idx) => {
                const ex = EXERCISES[session.exerciseId];
                const grade = getScoreGrade(session.score);
                return (
                  <View key={session.id} style={[
                    styles.sessionCard,
                    idx < sessions.length - 1 && styles.sessionCardBorderBottom,
                  ]}>
                    <View style={[styles.sessionIconBox, { backgroundColor: `${ex.accentColor}18` }]}>
                      <ExerciseIcon exerciseId={session.exerciseId} size={22} color={ex.accentColor} />
                    </View>
                    <View style={styles.sessionMiddle}>
                      <Text style={styles.sessionName}>{ex.name}</Text>
                      <View style={styles.sessionMeta}>
                        <Text style={styles.sessionMetaItem}>{session.reps} reps</Text>
                        <Text style={styles.sessionMetaDot}>·</Text>
                        <Text style={styles.sessionMetaItem}>{formatDuration(session.duration)}</Text>
                        <Text style={styles.sessionMetaDot}>·</Text>
                        <Text style={styles.sessionMetaItem}>{session.calories} kcal</Text>
                      </View>
                      <View style={[styles.formBadge, { backgroundColor: `${ex.accentColor}18` }]}>
                        <Text style={[styles.formBadgeText, { color: ex.accentColor }]}>{session.formQuality}</Text>
                      </View>
                    </View>
                    <View style={styles.sessionRight}>
                      <Text style={[styles.gradeText, { color: grade.color }]}>{grade.grade}</Text>
                      <Text style={styles.scoreText}>{session.score} pts</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No workouts found</Text>
            <Text style={styles.emptySubtitle}>Try adjusting your filters</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 8 },
  backText: { color: Colors.cyan, fontSize: 17, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  countBadge: { backgroundColor: Colors.cyanDim, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, color: Colors.cyan, fontSize: 13, fontWeight: '700' },
  cloudSection: { paddingHorizontal: 20, marginBottom: 12 },
  cloudTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  cloudLoading: { paddingVertical: 16, alignItems: 'center' },
  cloudEmpty: { fontSize: 13, color: Colors.textMuted, paddingVertical: 8 },
  cloudList: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cloudRow: { paddingHorizontal: 14, paddingVertical: 10 },
  cloudExercise: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  cloudMeta: { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
  cloudTimestamp: { fontSize: 11, color: Colors.textMuted },
  searchWrapper: { paddingHorizontal: 20, marginBottom: 12 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  clearIcon: { fontSize: 13, color: Colors.textMuted, padding: 4 },
  filtersList: { maxHeight: 44, marginBottom: 12 },
  filtersContent: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { borderColor: Colors.cyan, backgroundColor: Colors.cyanDim },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  filterTextActive: { color: Colors.cyan },
  listContent: { paddingHorizontal: 20, gap: 16 },
  dateGroup: {},
  dateLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  sessionGroup: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  sessionCardBorderBottom: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  sessionIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sessionMiddle: { flex: 1 },
  sessionName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  sessionMetaItem: { fontSize: 12, color: Colors.textMuted },
  sessionMetaDot: { fontSize: 10, color: Colors.textMuted },
  formBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  formBadgeText: { fontSize: 10, fontWeight: '700' },
  sessionRight: { alignItems: 'flex-end', gap: 2 },
  gradeText: { fontSize: 24, fontWeight: '900' },
  scoreText: { fontSize: 11, color: Colors.textMuted },
  emptyState: { paddingVertical: 60, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted },
});
