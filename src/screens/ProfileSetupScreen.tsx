import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { NeonButton } from '../components/ui/NeonButton';
import { useApp } from '../context/AppContext';
import type { Gender, FitnessGoal, ExperienceLevel } from '../context/AppContext';

const { width } = Dimensions.get('window');
type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'ProfileSetup'> };

const STEPS = ['Name', 'Gender', 'Goal', 'Level'];

const GENDERS: { id: Gender; label: string; emoji: string }[] = [
  { id: 'male', label: 'Male', emoji: '♂' },
  { id: 'female', label: 'Female', emoji: '♀' },
  { id: 'other', label: 'Other', emoji: '⚧' },
];

const GOALS: { id: FitnessGoal; label: string; desc: string; icon: string }[] = [
  { id: 'lose_weight', label: 'Lose Weight', desc: 'Burn fat and slim down', icon: '🔥' },
  { id: 'build_muscle', label: 'Build Muscle', desc: 'Gain strength and mass', icon: '💪' },
  { id: 'improve_endurance', label: 'Endurance', desc: 'Boost stamina and cardio', icon: '🏃' },
  { id: 'flexibility', label: 'Flexibility', desc: 'Improve range of motion', icon: '🧘' },
];

const LEVELS: { id: ExperienceLevel; label: string; desc: string; reps: string }[] = [
  { id: 'beginner', label: 'Beginner', desc: 'New to working out', reps: '< 3 months' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Some experience', reps: '3–12 months' },
  { id: 'advanced', label: 'Advanced', desc: 'Experienced athlete', reps: '1+ years' },
];

export default function ProfileSetupScreen({ navigation }: Props) {
  const { setProfile, setHasCompletedOnboarding } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateStep = (nextStep: number) => {
    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: (nextStep + 1) / STEPS.length,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start();
    setStep(nextStep);
  };

  const canProceed = () => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return gender !== null;
    if (step === 2) return goal !== null;
    if (step === 3) return level !== null;
    return false;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      animateStep(step + 1);
    } else {
      setProfile({
        name: name.trim(),
        gender: gender!,
        goal: goal!,
        level: level!,
        avatar: gender === 'female' ? 'female_athletic' : 'male_athletic',
        voice: 'energetic_male',
        streak: 0,
        totalWorkouts: 0,
        totalReps: 0,
      });
      setHasCompletedOnboarding(true);
      navigation.replace('Main');
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A0A', '#0A0A12']} style={StyleSheet.absoluteFill} />

        {/* Header */}
        <View style={styles.header}>
          {step > 0 && (
            <TouchableOpacity onPress={() => animateStep(step - 1)} style={styles.backBtn}>
              <Text style={styles.backText}>‹ Back</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.stepLabel}>{step + 1} / {STEPS.length}</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
            <LinearGradient colors={[Colors.cyan, '#0066FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step title */}
          <Text style={styles.stepTitle}>{
            step === 0 ? "What's your name?" :
            step === 1 ? 'How do you identify?' :
            step === 2 ? 'What\'s your goal?' :
            'What\'s your level?'
          }</Text>
          <Text style={styles.stepSubtitle}>{
            step === 0 ? 'Your AI coach will use this to personalize your experience.' :
            step === 1 ? 'This helps calibrate your performance benchmarks.' :
            step === 2 ? 'We\'ll tailor your workout recommendations.' :
            'Honest answer gives you better results.'
          }</Text>

          {/* Step 0: Name */}
          {step === 0 && (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder="Enter your name"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={canProceed() ? handleNext : undefined}
                maxLength={30}
              />
              <View style={[styles.inputUnderline, name.length >= 2 && styles.inputUnderlineActive]} />
            </View>
          )}

          {/* Step 1: Gender */}
          {step === 1 && (
            <View style={styles.optionsRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.genderCard, gender === g.id && styles.selectedCard]}
                  onPress={() => setGender(g.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genderEmoji}>{g.emoji}</Text>
                  <Text style={[styles.optionLabel, gender === g.id && { color: Colors.cyan }]}>{g.label}</Text>
                  {gender === g.id && <View style={styles.checkDot} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 2: Goal */}
          {step === 2 && (
            <View style={styles.optionsList}>
              {GOALS.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.listCard, goal === g.id && styles.selectedCard]}
                  onPress={() => setGoal(g.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.listIcon}>{g.icon}</Text>
                  <View style={styles.listText}>
                    <Text style={[styles.listTitle, goal === g.id && { color: Colors.cyan }]}>{g.label}</Text>
                    <Text style={styles.listDesc}>{g.desc}</Text>
                  </View>
                  <View style={[styles.radio, goal === g.id && styles.radioActive]}>
                    {goal === g.id && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 3: Level */}
          {step === 3 && (
            <View style={styles.optionsList}>
              {LEVELS.map((l, idx) => (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.listCard, level === l.id && styles.selectedCard]}
                  onPress={() => setLevel(l.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.levelBadge, { backgroundColor: idx === 0 ? Colors.successDim : idx === 1 ? Colors.orangeDim : Colors.cyanDim }]}>
                    <Text style={[styles.levelBadgeText, { color: idx === 0 ? Colors.success : idx === 1 ? Colors.orange : Colors.cyan }]}>
                      {['I', 'II', 'III'][idx]}
                    </Text>
                  </View>
                  <View style={styles.listText}>
                    <Text style={[styles.listTitle, level === l.id && { color: Colors.cyan }]}>{l.label}</Text>
                    <Text style={styles.listDesc}>{l.desc} · {l.reps}</Text>
                  </View>
                  <View style={[styles.radio, level === l.id && styles.radioActive]}>
                    {level === l.id && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* CTA */}
        <View style={styles.ctaContainer}>
          <NeonButton
            title={step === STEPS.length - 1 ? "Let's Go! 🚀" : 'Continue'}
            onPress={handleNext}
            disabled={!canProceed()}
            variant="primary"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  backBtn: { padding: 8 },
  backText: { color: Colors.cyan, fontSize: 17, fontWeight: '600' },
  stepLabel: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  progressTrack: { height: 3, backgroundColor: Colors.border, marginHorizontal: 24, borderRadius: 2, overflow: 'hidden', marginBottom: 32 },
  progressFill: { height: '100%', borderRadius: 2 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  stepTitle: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8, marginBottom: 10, lineHeight: 36 },
  stepSubtitle: { fontSize: 16, color: Colors.textSecondary, lineHeight: 24, marginBottom: 36 },
  inputContainer: { marginTop: 8 },
  textInput: {
    fontSize: 28, fontWeight: '700', color: Colors.textPrimary,
    paddingVertical: 12, paddingHorizontal: 0, backgroundColor: 'transparent',
  },
  inputUnderline: { height: 2, backgroundColor: Colors.border, borderRadius: 1, marginTop: 4 },
  inputUnderlineActive: { backgroundColor: Colors.cyan },
  optionsRow: { flexDirection: 'row', gap: 12 },
  genderCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24,
    backgroundColor: Colors.card, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, position: 'relative',
  },
  selectedCard: { borderColor: Colors.cyan, backgroundColor: Colors.cyanDim },
  genderEmoji: { fontSize: 28, marginBottom: 8 },
  optionLabel: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  checkDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.cyan },
  optionsList: { gap: 12 },
  listCard: {
    flexDirection: 'row', alignItems: 'center', padding: 18,
    backgroundColor: Colors.card, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, gap: 14,
  },
  listIcon: { fontSize: 26, width: 36, textAlign: 'center' },
  listText: { flex: 1 },
  listTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  listDesc: { fontSize: 13, color: Colors.textMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.cyan },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.cyan },
  levelBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  levelBadgeText: { fontSize: 16, fontWeight: '800' },
  ctaContainer: { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16 },
});
