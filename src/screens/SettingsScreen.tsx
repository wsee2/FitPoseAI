import React, { useState } from 'react';
import { setEnabled as ttsSetEnabled } from '../services/ttsService';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
} from 'react-native';
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

const AVATAR_OPTIONS = [
  { id: 'male_athletic', label: 'Athletic Male', emoji: '🏋️‍♂️' },
  { id: 'female_athletic', label: 'Athletic Female', emoji: '🏋️‍♀️' },
  { id: 'male_casual', label: 'Casual Male', emoji: '👨' },
  { id: 'female_casual', label: 'Casual Female', emoji: '👩' },
];

const VOICE_OPTIONS = [
  { id: 'energetic_male', label: 'Energetic Male', desc: 'High energy, motivational' },
  { id: 'calm_male', label: 'Calm Male', desc: 'Steady, professional' },
  { id: 'energetic_female', label: 'Energetic Female', desc: 'High energy, encouraging' },
  { id: 'calm_female', label: 'Calm Female', desc: 'Calm, supportive' },
];

export default function SettingsScreen({ navigation }: Props) {
  const { profile, updateProfile, authUser, signOutUser } = useApp();

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
  const insets = useSafeAreaInsets();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);

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
        { id: 'name', label: 'Name', subtitle: profile?.name ?? '—', icon: '👤', type: 'nav', onPress: () => {} },
        { id: 'goal', label: 'Fitness Goal', subtitle: profile?.goal ? goalLabels[profile.goal] : '—', icon: '🎯', type: 'nav', onPress: () => {} },
        { id: 'level', label: 'Experience Level', subtitle: profile?.level ? levelLabels[profile.level] : '—', icon: '📊', type: 'nav', onPress: () => {} },
      ],
    },
    {
      title: 'AI Coach Avatar',
      rows: [
        { id: 'avatar', label: 'Avatar Style', subtitle: AVATAR_OPTIONS.find(a => a.id === profile?.avatar)?.label ?? 'Athletic Male', icon: '🤖', type: 'nav', onPress: () => setShowAvatarPicker(!showAvatarPicker) },
        { id: 'voice', label: 'Voice Type', subtitle: VOICE_OPTIONS.find(v => v.id === profile?.voice)?.label ?? 'Energetic Male', icon: '🎙️', type: 'nav', onPress: () => setShowVoicePicker(!showVoicePicker) },
      ],
    },
    {
      title: 'Audio & Haptics',
      rows: [
        { id: 'voice_coaching', label: 'Voice Coaching', subtitle: 'AI coach feedback during workouts', icon: '🔊', type: 'toggle', value: voiceEnabled, onToggle: (v: boolean) => { setVoiceEnabled(v); ttsSetEnabled(v); } },
        { id: 'haptics_setting', label: 'Haptic Feedback', subtitle: 'Vibration on reps and feedback', icon: '📳', type: 'toggle', value: haptics, onToggle: setHaptics },
      ],
    },
    {
      title: 'Notifications',
      rows: [
        { id: 'notifs', label: 'Workout Reminders', subtitle: 'Daily reminder to stay consistent', icon: '🔔', type: 'toggle', value: notifications, onToggle: setNotifications },
        { id: 'auto_save', label: 'Auto-Save Sessions', subtitle: 'Sync workouts to cloud', icon: '☁️', type: 'toggle', value: autoSave, onToggle: setAutoSave },
      ],
    },
    {
      title: 'Privacy',
      rows: [
        { id: 'camera', label: 'Camera Access', subtitle: 'Required for pose detection', icon: '📷', type: 'nav', onPress: () => {} },
        { id: 'data', label: 'Workout Data', subtitle: 'Manage your data in Firebase', icon: '🗄️', type: 'nav', onPress: () => {} },
        { id: 'export', label: 'Export Data (CSV)', subtitle: 'Download your workout history', icon: '📁', type: 'nav', onPress: () => {} },
      ],
    },
    {
      title: 'About',
      rows: [
        { id: 'version', label: 'App Version', subtitle: '1.0.0 (Build 1)', icon: 'ℹ️', type: 'value' },
        { id: 'feedback', label: 'Send Feedback', subtitle: 'Help us improve FitPose AI', icon: '💬', type: 'nav', onPress: () => {} },
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

                  {/* Avatar picker */}
                  {row.id === 'avatar' && showAvatarPicker && (
                    <View style={styles.picker}>
                      {AVATAR_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.pickerOption, profile?.avatar === opt.id && styles.pickerOptionActive]}
                          onPress={() => { updateProfile({ avatar: opt.id as any }); setShowAvatarPicker(false); }}
                        >
                          <Text style={styles.pickerEmoji}>{opt.emoji}</Text>
                          <Text style={[styles.pickerLabel, profile?.avatar === opt.id && { color: Colors.cyan }]}>{opt.label}</Text>
                          {profile?.avatar === opt.id && <Text style={styles.pickerCheck}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

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
  pickerOption: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderRadius: 10 },
  pickerOptionActive: { backgroundColor: Colors.cyanDim },
  pickerEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  pickerText: { flex: 1 },
  pickerLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  pickerDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pickerCheck: { color: Colors.cyan, fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, paddingTop: 16, paddingBottom: 8 },
});
