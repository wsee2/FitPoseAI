import React, { useState } from 'react';
import { setEnabled as ttsSetEnabled } from '../services/ttsService';
import { setEnabled as hapticsSetEnabled } from '../services/hapticsService';
import { syncReminderState } from '../services/notificationsService';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput, Linking,
} from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { Colors, BorderRadius } from '../theme';
import { useApp } from '../context/AppContext';
import type { SettingsStackParamList } from '../navigation/types';

type Props = { navigation: NativeStackNavigationProp<SettingsStackParamList, 'Settings'> };

interface SettingRow {
  id: string;
  label: string;
  subtitle?: string;
  icon: string;
  type: 'toggle' | 'nav' | 'value' | 'danger';
  value?: boolean | string;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  color?: string;
}

const GOAL_OPTIONS = [
  { id: 'lose_weight',       label: 'Lose Weight',        emoji: '⚖️' },
  { id: 'build_muscle',      label: 'Build Muscle',        emoji: '💪' },
  { id: 'improve_endurance', label: 'Improve Endurance',   emoji: '🏃' },
  { id: 'flexibility',       label: 'Flexibility',          emoji: '🤸' },
];

const VOICE_OPTIONS = [
  { id: 'male', label: 'Male', desc: 'Male coaching voice' },
  { id: 'female', label: 'Female', desc: 'Female coaching voice' },
];

export default function SettingsScreen({ navigation }: Props) {
  const { profile, updateProfile, authUser, signOutUser } = useApp();
  const { hasPermission: hasCameraPermission } = useCameraPermission();

  // The app can only ever REQUEST camera permission once via the in-app dialog — on iOS a
  // single denial permanently blocks further in-app re-prompts, and Android behaves the same
  // once "don't ask again" is set. Deep-linking to the OS app-settings page is the only
  // action that reliably works to grant OR revoke it regardless of that history, so this row
  // always opens system settings rather than trying to guess which platform-specific
  // in-app-prompt-vs-settings-page path applies to the current state.
  const handleCameraAccess = () => {
    Linking.openSettings().catch(() => {
      Alert.alert('Unable to open settings', 'Please open your device Settings app and grant camera access to FitPose AI manually.');
    });
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await signOutUser();
          // Navigate up to the root stack and replace with Login.
          navigation.getParent()?.getParent()?.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] })
          );
        },
      },
    ]);
  };

  // Turning reminders ON needs an immediate permission check (not just persisting the
  // preference) so a denial is reported to the user right here, rather than the toggle
  // silently snapping back off later via AppContext's background sync effect with no
  // explanation. Turning OFF just cancels the scheduled notification and persists.
  const handleToggleReminders = async (wantsOn: boolean) => {
    if (wantsOn) {
      const granted = await syncReminderState(true);
      if (!granted) {
        Alert.alert(
          'Notifications disabled',
          'FitPose needs notification permission to send workout reminders. Enable it for FitPose in your device Settings, then try again.'
        );
        return;
      }
    } else {
      await syncReminderState(false);
    }
    updateProfile({ notificationsEnabled: wantsOn });
  };

  const insets = useSafeAreaInsets();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  const goalLabels: Record<string, string> = {
    lose_weight: 'Lose Weight',
    build_muscle: 'Build Muscle',
    improve_endurance: 'Endurance',
    flexibility: 'Flexibility',
  };

  const levelLabels: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  };

  const sections: { title: string; rows: SettingRow[] }[] = [
    {
      title: 'Account',
      rows: [
        { id: 'email', label: 'Email', subtitle: authUser?.email ?? '—', icon: '📧', type: 'value' },
        { id: 'logout', label: 'Sign Out', subtitle: 'Sign out of your account', icon: '🚪', type: 'danger', color: Colors.error, onPress: handleLogout },
      ],
    },
    {
      title: 'Profile',
      rows: [
        { id: 'name', label: 'Name', subtitle: profile?.name ?? '—', icon: '👤', type: 'nav', onPress: () => { setNameValue(profile?.name ?? ''); setEditingName(!editingName); } },
        { id: 'goal', label: 'Fitness Goal', subtitle: profile?.goal ? goalLabels[profile.goal] : '—', icon: '🎯', type: 'nav', onPress: () => setShowGoalPicker(!showGoalPicker) },
        // Not user-editable: level is earned automatically from in-app training history
        // (see computeEligibleLevel / AppContext's auto-upgrade effect), never self-reported
        // after onboarding, so a manual override here couldn't silently invalidate it.
        // type: 'value' (not 'nav') is what actually removes the chevron/tap handler — see
        // the row renderer below, which disables touch and drops onPress for this type.
        { id: 'level', label: 'Experience Level', subtitle: profile?.level ? levelLabels[profile.level] : '—', icon: '📊', type: 'value' },
      ],
    },
    {
      title: 'AI Coach',
      rows: [
        { id: 'voice', label: 'Voice Type', subtitle: VOICE_OPTIONS.find(v => v.id === profile?.voice)?.label ?? 'Male', icon: '🎙️', type: 'nav', onPress: () => setShowVoicePicker(!showVoicePicker) },
      ],
    },
    {
      title: 'Audio & Haptics',
      rows: [
        { id: 'voice_coaching', label: 'Voice Coaching', subtitle: 'AI coach feedback during workouts', icon: '🔊', type: 'toggle', value: voiceEnabled, onToggle: (v: boolean) => { setVoiceEnabled(v); ttsSetEnabled(v); } },
        { id: 'haptics_setting', label: 'Haptic Feedback', subtitle: 'Vibration on reps and feedback', icon: '📳', type: 'toggle', value: haptics, onToggle: (v: boolean) => { setHaptics(v); hapticsSetEnabled(v); } },
      ],
    },
    {
      title: 'Notifications',
      rows: [
        { id: 'notifs', label: 'Workout Reminders', subtitle: 'Daily reminder to stay consistent', icon: '🔔', type: 'toggle', value: profile?.notificationsEnabled ?? true, onToggle: handleToggleReminders },
      ],
    },
    {
      title: 'Privacy',
      rows: [
        { id: 'camera', label: 'Camera Access', subtitle: hasCameraPermission ? 'Granted — tap to review in Settings' : 'Not granted — tap to enable in Settings', icon: '📷', type: 'nav', onPress: handleCameraAccess },
      ],
    },
    {
      title: 'About',
      rows: [
        { id: 'version', label: 'App Version', subtitle: '1.0.0 (Build 1)', icon: 'ℹ️', type: 'value' },
        { id: 'reset', label: 'Reset All Data', subtitle: 'This cannot be undone', icon: '🗑️', type: 'danger', color: Colors.error, onPress: () => {
          Alert.alert('Reset Data', 'Are you sure you want to delete all workout data? This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => {} },
          ]);
        }},
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <LinearGradient colors={['#1A1A2E', '#141414']} style={styles.profileGrad}>
            <LinearGradient colors={[Colors.cyanDim, '#1A1A2E']} style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>{profile?.name?.[0]?.toUpperCase() ?? 'U'}</Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile?.name ?? 'Athlete'}</Text>
              <Text style={styles.profileStats}>
                {profile?.totalWorkouts ?? 28} workouts · {profile?.streak ?? 14} day streak
              </Text>
              <View style={styles.profileBadge}>
                <Text style={styles.profileBadgeText}>{profile?.level ? levelLabels[profile.level] : 'Beginner'}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.rows.map((row, idx) => (
                <React.Fragment key={row.id}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={row.type !== 'toggle' ? row.onPress : undefined}
                    activeOpacity={row.type === 'toggle' ? 1 : 0.8}
                    disabled={row.type === 'value'}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: row.color ? `${row.color}18` : Colors.cardElevated }]}>
                      <Text style={styles.rowIconText}>{row.icon}</Text>
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={[styles.rowLabel, row.color ? { color: row.color } : null]}>{row.label}</Text>
                      {row.subtitle && <Text style={styles.rowSubtitle}>{row.subtitle}</Text>}
                    </View>
                    {row.type === 'toggle' && (
                      <Switch
                        value={row.value as boolean}
                        onValueChange={row.onToggle}
                        trackColor={{ false: Colors.border, true: Colors.cyanDim }}
                        thumbColor={row.value ? Colors.cyan : Colors.textMuted}
                      />
                    )}
                    {row.type === 'nav' && (
                      <Text style={[styles.chevron, row.color ? { color: row.color } : null]}>›</Text>
                    )}
                    {row.type === 'value' && (
                      <Text style={styles.rowValue}>{row.subtitle}</Text>
                    )}
                  </TouchableOpacity>
                  {idx < section.rows.length - 1 && <View style={styles.divider} />}

                  {/* Voice picker */}
                  {row.id === 'voice' && showVoicePicker && (
                    <View style={styles.picker}>
                      {VOICE_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.pickerOption, profile?.voice === opt.id && styles.pickerOptionActive]}
                          onPress={() => { updateProfile({ voice: opt.id as any }); setShowVoicePicker(false); }}
                        >
                          <View style={styles.pickerText}>
                            <Text style={[styles.pickerLabel, profile?.voice === opt.id && { color: Colors.cyan }]}>{opt.label}</Text>
                            <Text style={styles.pickerDesc}>{opt.desc}</Text>
                          </View>
                          {profile?.voice === opt.id && <Text style={styles.pickerCheck}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Name inline editor */}
                  {row.id === 'name' && editingName && (
                    <View style={styles.inlineEdit}>
                      <TextInput
                        style={styles.inlineInput}
                        value={nameValue}
                        onChangeText={setNameValue}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (nameValue.trim()) updateProfile({ name: nameValue.trim() });
                          setEditingName(false);
                        }}
                        onBlur={() => {
                          if (nameValue.trim()) updateProfile({ name: nameValue.trim() });
                          setEditingName(false);
                        }}
                        placeholder="Enter your name"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  )}

                  {/* Goal picker */}
                  {row.id === 'goal' && showGoalPicker && (
                    <View style={styles.picker}>
                      {GOAL_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.pickerOption, profile?.goal === opt.id && styles.pickerOptionActive]}
                          onPress={() => { updateProfile({ goal: opt.id as any }); setShowGoalPicker(false); }}
                        >
                          <Text style={styles.pickerEmoji}>{opt.emoji}</Text>
                          <Text style={[styles.pickerLabel, profile?.goal === opt.id && { color: Colors.cyan }]}>{opt.label}</Text>
                          {profile?.goal === opt.id && <Text style={styles.pickerCheck}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>FitPose AI · Built with ❤️ for better fitness</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8 },
  content: { paddingHorizontal: 20, gap: 6 },
  profileCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: Colors.cyanGlow, marginBottom: 16 },
  profileGrad: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.cyanGlow },
  profileInitial: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 3 },
  profileStats: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  profileBadge: { backgroundColor: Colors.cyanDim, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.cyanGlow },
  profileBadgeText: { fontSize: 11, color: Colors.cyan, fontWeight: '700' },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 },
  sectionCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowIconText: { fontSize: 18 },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  rowSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 13, color: Colors.textMuted },
  chevron: { fontSize: 20, color: Colors.textMuted },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },
  picker: { paddingHorizontal: 14, paddingBottom: 8, borderTopWidth: 1, borderTopColor: Colors.border, gap: 4 },
  inlineEdit: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  inlineInput: { backgroundColor: Colors.cardElevated, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.cyanGlow },
  pickerOption: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderRadius: 10 },
  pickerOptionActive: { backgroundColor: Colors.cyanDim },
  pickerEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  pickerText: { flex: 1 },
  pickerLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  pickerDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pickerCheck: { color: Colors.cyan, fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, paddingTop: 16, paddingBottom: 8 },
});
