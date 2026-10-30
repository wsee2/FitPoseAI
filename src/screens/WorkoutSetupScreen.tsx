import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { Colors, BorderRadius } from '../theme';
import { ExerciseIcon } from '../components/ui/ExerciseIcon';
import { NeonButton } from '../components/ui/NeonButton';
import { EXERCISES, formatDuration } from '../data/exercises';
import { useApp } from '../context/AppContext';
import {
  getDefaultTarget, REP_TARGET_STEP, REP_TARGET_MIN, REP_TARGET_MAX,
  PLANK_TARGET_STEP_SECONDS, PLANK_TARGET_MIN_SECONDS, PLANK_TARGET_MAX_SECONDS,
  DEFAULT_SETS, SETS_STEP, SETS_MIN, SETS_MAX,
} from '../utils/workoutTarget';
import type { HomeStackParamList, WorkoutSetupNavigationProp } from '../navigation/types';

type Props = {
  navigation: WorkoutSetupNavigationProp;
  route: RouteProp<HomeStackParamList, 'WorkoutSetup'>;
};

export default function WorkoutSetupScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const exercise = EXERCISES[exerciseId];
  const insets = useSafeAreaInsets();
  const { profile } = useApp();
  const level = profile?.level ?? 'beginner';
  const isPlank = exerciseId === 'plank';

  // Both re-default whenever this screen is entered — deliberately not persisted, same
  // "advisory, per-workout choice" treatment as the target stepper it replaces.
  const [target, setTarget] = useState<number>(() => getDefaultTarget(exerciseId, level));
  const [sets, setSets] = useState<number>(DEFAULT_SETS);

  useEffect(() => {
    setTarget(getDefaultTarget(exerciseId, level));
  }, [exerciseId, level]);

  const targetStep = isPlank ? PLANK_TARGET_STEP_SECONDS : REP_TARGET_STEP;
  const targetMin = isPlank ? PLANK_TARGET_MIN_SECONDS : REP_TARGET_MIN;
  const targetMax = isPlank ? PLANK_TARGET_MAX_SECONDS : REP_TARGET_MAX;
  const targetLabel = isPlank ? formatDuration(target) : `${target} reps`;

  const adjustTarget = (delta: number) => {
    setTarget((t) => Math.min(targetMax, Math.max(targetMin, t + delta)));
  };
  const adjustSets = (delta: number) => {
    setSets((s) => Math.min(SETS_MAX, Math.max(SETS_MIN, s + delta)));
  };

  const handleBegin = () => {
    navigation.navigate('Workout', { exerciseId, target, sets });
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout Setup</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.exerciseRow}>
        <View style={[styles.iconBox, { backgroundColor: `${exercise.accentColor}18` }]}>
          <ExerciseIcon exerciseId={exercise.id} size={40} color={exercise.accentColor} />
        </View>
        <View>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.exerciseDesc} numberOfLines={2}>{exercise.description}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.panelGrad}>
          {/* Per-set target */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingLabel}>{isPlank ? 'Hold Time' : 'Reps'}</Text>
              <Text style={styles.settingHint}>Defaults from your experience level</Text>
            </View>
            <View style={styles.stepperControl}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustTarget(-targetStep)}
                disabled={target <= targetMin}
              >
                <Text style={[styles.stepperBtnText, target <= targetMin && styles.stepperBtnTextDisabled]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.settingValue}>{targetLabel}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustTarget(targetStep)}
                disabled={target >= targetMax}
              >
                <Text style={[styles.stepperBtnText, target >= targetMax && styles.stepperBtnTextDisabled]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Sets per session */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingLabel}>Sets</Text>
              <Text style={styles.settingHint}>How many sets this session</Text>
            </View>
            <View style={styles.stepperControl}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustSets(-SETS_STEP)}
                disabled={sets <= SETS_MIN}
              >
                <Text style={[styles.stepperBtnText, sets <= SETS_MIN && styles.stepperBtnTextDisabled]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.settingValue}>{sets}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustSets(SETS_STEP)}
                disabled={sets >= SETS_MAX}
              >
                <Text style={[styles.stepperBtnText, sets >= SETS_MAX && styles.stepperBtnTextDisabled]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 72 }]}>
        <NeonButton
          title="Begin Workout"
          onPress={handleBegin}
          variant="primary"
          style={{ marginHorizontal: 24 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  backBtn: { padding: 8 },
  backText: { color: Colors.cyan, fontSize: 17, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, marginTop: 12, marginBottom: 24,
  },
  iconBox: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  exerciseName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  exerciseDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, maxWidth: 220 },
  panel: {
    marginHorizontal: 20, borderRadius: BorderRadius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  panelGrad: { padding: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // flex: 1 lets the label/hint wrap onto a second line instead of stretching the row wide
  // enough to push stepperControl past the panel's right edge — panel has overflow: 'hidden',
  // so an overflowing "+" button was getting silently clipped rather than just misaligned.
  settingTextCol: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  settingHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 18 },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  stepperBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardElevated, borderWidth: 1, borderColor: Colors.border,
  },
  stepperBtnText: { fontSize: 20, fontWeight: '800', color: Colors.cyan, lineHeight: 22 },
  stepperBtnTextDisabled: { color: Colors.textMuted },
  settingValue: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, minWidth: 56, textAlign: 'center' },
  // paddingBottom mirrors ExerciseSelectScreen's ctaBar convention (insets.bottom + 72):
  // this screen isn't tab-bar-hidden like WorkoutScreen, so the floating button must clear
  // the absolutely-positioned tab bar itself (getDefaultTabBarStyle: height = 60 + insets.bottom).
  ctaBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 40 },
});
