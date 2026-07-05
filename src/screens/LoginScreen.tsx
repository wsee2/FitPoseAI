import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, BorderRadius } from '../theme';
import { NeonButton } from '../components/ui/NeonButton';
import { signIn, getAuthErrorMessage } from '../services/firebaseAuth';
import { loadProfile } from '../services/firebaseProfile';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { setProfile, setHasCompletedOnboarding } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await signIn(email.trim().toLowerCase(), password);
      // Load profile to decide destination and pre-fill context before navigating.
      const savedProfile = await loadProfile(user.uid);
      if (savedProfile) {
        setProfile(savedProfile);
        setHasCompletedOnboarding(true);
        navigation.replace('Main');
      } else {
        navigation.replace('ProfileSetup');
      }
    } catch (err: any) {
      setError(getAuthErrorMessage(err.code ?? ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A0A', '#0A0A12']} style={StyleSheet.absoluteFill} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo mark */}
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoLetter}>F</Text>
            </View>
            <View>
              <Text style={styles.brandName}>FitPose<Text style={styles.brandAccent}> AI</Text></Text>
              <Text style={styles.brandSub}>Welcome back</Text>
            </View>
          </View>

          <Text style={styles.title}>Sign in to your{'\n'}account</Text>

          {/* Error */}
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <NeonButton
            title={loading ? '' : 'Sign In'}
            onPress={handleLogin}
            disabled={loading}
            variant="primary"
            style={{ marginTop: 8 }}
          >
            {loading && <ActivityIndicator color="#000" />}
          </NeonButton>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.secondaryBtnText}>Create a new account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.tertiaryBtn} onPress={() => navigation.navigate('Onboarding')}>
            <Text style={styles.tertiaryBtnText}>See what FitPose AI offers →</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 28 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 40 },
  logoMark: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.cyanDim, borderWidth: 1.5, borderColor: Colors.cyanGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  logoLetter: { fontSize: 24, fontWeight: '900', color: Colors.cyan },
  brandName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  brandAccent: { color: Colors.cyan },
  brandSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  title: { fontSize: 34, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8, lineHeight: 40, marginBottom: 32 },
  errorBox: {
    backgroundColor: 'rgba(255,59,59,0.12)', borderWidth: 1, borderColor: 'rgba(255,59,59,0.3)',
    borderRadius: BorderRadius.lg, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20,
  },
  errorText: { color: '#FF6B6B', fontSize: 14, fontWeight: '500' },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16,
  },
  input: { flex: 1, height: 52, fontSize: 16, color: Colors.textPrimary },
  eyeBtn: { padding: 8 },
  eyeText: { fontSize: 18 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  secondaryBtn: {
    borderWidth: 1.5, borderColor: Colors.cyanGlow, borderRadius: BorderRadius.lg,
    paddingVertical: 14, alignItems: 'center',
    backgroundColor: Colors.cyanDim,
  },
  secondaryBtnText: { color: Colors.cyan, fontSize: 16, fontWeight: '700' },
  tertiaryBtn: { alignItems: 'center', paddingVertical: 20 },
  tertiaryBtnText: { color: Colors.textMuted, fontSize: 14 },
});
