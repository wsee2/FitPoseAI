import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, BorderRadius } from '../theme';
import { ExerciseIcon } from '../components/ui/ExerciseIcon';
import { NeonButton } from '../components/ui/NeonButton';
import { EXERCISES, ExerciseId } from '../data/exercises';
import type { HomeStackParamList } from '../navigation/types';

const { width } = Dimensions.get('window');
type Props = { navigation: NativeStackNavigationProp<HomeStackParamList, 'ExerciseSelect'> };

const EXERCISE_LIST = Object.values(EXERCISES);

const MUSCLE_ICONS: Record<string, string> = {
  'Quadriceps': '🦵', 'Hamstrings': '🦵', 'Glutes': '🍑',
  'Core': '🫁', 'Chest': '💪', 'Shoulders': '🏋️',
  'Triceps': '💪', 'Abdominals': '🤸', 'Hip Flexors': '🦴',
  'Back': '🔙', 'Calves': '🦿',
};

export default function ExerciseSelectScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ExerciseId | null>(null);
  const [hoveredId, setHoveredId] = useState<ExerciseId | null>(null);

  const handleStart = () => {
    if (selected) {
      navigation.navigate('CameraCalibration', { exerciseId: selected });
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Exercise</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.subtitle}>
        Select an exercise to begin your AI-powered session.
      </Text>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {EXERCISE_LIST.map((ex) => {
          const isSelected = selected === ex.id;
          return (
            <TouchableOpacity
              key={ex.id}
              onPress={() => setSelected(ex.id)}
              activeOpacity={0.88}
              style={[
                styles.cardWrapper,
                isSelected && { shadowColor: ex.accentColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
              ]}
            >
              <LinearGradient
                colors={isSelected
                  ? [`${ex.accentColor}18`, '#141414']
                  : ['#1A1A1A', '#141414']}
                style={[styles.card, isSelected && { borderColor: ex.accentColor }]}
              >
                {/* Left: Icon */}
                <View style={[styles.iconBox, { backgroundColor: `${ex.accentColor}18` }]}>
                  <ExerciseIcon exerciseId={ex.id} size={40} color={isSelected ? ex.accentColor : Colors.textSecondary} />
                </View>

                {/* Center: Info */}
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.exerciseName, isSelected && { color: ex.accentColor }]}>
                      {ex.name}
                    </Text>
                    <View style={[styles.diffBadge, { backgroundColor: `${ex.accentColor}18`, borderColor: `${ex.accentColor}40` }]}>
                      <Text style={[styles.diffText, { color: ex.accentColor }]}>{ex.difficulty}</Text>
                    </View>
                  </View>
                  <Text style={styles.exerciseDesc} numberOfLines={2}>{ex.description}</Text>
                  <View style={styles.muscleRow}>
                    {ex.targetMuscles.slice(0, 3).map((m) => (
                      <View key={m} style={styles.muscleChip}>
                        <Text style={styles.muscleText}>{m}</Text>
                      </View>
                    ))}
                    {ex.targetMuscles.length > 3 && (
                      <Text style={styles.moreText}>+{ex.targetMuscles.length - 3}</Text>
                    )}
                  </View>
                </View>

                {/* Right: Select indicator */}
                <View style={[styles.selectCircle, isSelected && { backgroundColor: ex.accentColor, borderColor: ex.accentColor }]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}

        {/* Detail panel when selected */}
        {selected && (
          <View style={styles.detailPanel}>
            <LinearGradient colors={['#1A1A1A', '#141414']} style={styles.detailGrad}>
              <Text style={styles.detailTitle}>Instructions</Text>
              {EXERCISES[selected].instructions.map((step, i) => (
                <View key={i} style={styles.instructionRow}>
                  <View style={[styles.stepNum, { backgroundColor: `${EXERCISES[selected].accentColor}18` }]}>
                    <Text style={[styles.stepNumText, { color: EXERCISES[selected].accentColor }]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.instructionText}>{step}</Text>
                </View>
              ))}
              <View style={styles.tipRow}>
                <Text style={styles.tipIcon}>💡</Text>
                <Text style={styles.tipText}>{EXERCISES[selected].tips[0]}</Text>
              </View>
            </LinearGradient>
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      {selected && (
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
          <LinearGradient
            colors={['transparent', Colors.background]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <NeonButton
            title={`Start ${EXERCISES[selected].name}`}
            onPress={handleStart}
            variant="primary"
            style={{ marginHorizontal: 24 }}
          />
        </View>
      )}
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
  subtitle: { fontSize: 14, color: Colors.textMuted, paddingHorizontal: 28, marginBottom: 20 },
  list: { paddingHorizontal: 20, gap: 12 },
  cardWrapper: {
    borderRadius: BorderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14,
    borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border,
  },
  iconBox: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  exerciseName: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  diffText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  exerciseDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginBottom: 8 },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  muscleChip: { backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  muscleText: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  moreText: { fontSize: 10, color: Colors.textMuted, paddingVertical: 3 },
  selectCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 14, color: Colors.textInverse, fontWeight: '800' },
  detailPanel: { borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginTop: 4 },
  detailGrad: { padding: 20 },
  detailTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 14 },
  instructionRow: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { fontSize: 13, fontWeight: '800' },
  instructionText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, flex: 1 },
  tipRow: { flexDirection: 'row', gap: 10, marginTop: 8, padding: 12, backgroundColor: Colors.goldDim, borderRadius: 10, alignItems: 'flex-start' },
  tipIcon: { fontSize: 16 },
  tipText: { fontSize: 13, color: Colors.gold, lineHeight: 18, flex: 1 },
  ctaBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 40 },
});
