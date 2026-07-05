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
import { signUp, getAuthErrorMessage } from '../services/firebaseAuth';
import type { RootStackParamList } from '../navigation/types';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'SignUp'> };

export default function SignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signUp(email.trim().toLowerCase(), password);
      // AppContext auth listener will fire and load user data.
      // ProfileSetup will call setProfile which saves to Firebase.
      navigation.replace('ProfileSetup');
    } catch (err: any) {
      console.error('[SignUp] error:', err.code, err.message);
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
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create your{'\n'}account</Text>
          <Text style={styles.subtitle}>Your workouts and progress will be saved to your account.</Text>

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
                placeholder="Min. 6 characters"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPw ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={[
              styles.inputWrap,
              confirm.length > 0 && (confirm === password ? styles.inputWrapValid : styles.inputWrapError),
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Repeat password"
                placeholderTextColor={Colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPw}
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
            </View>
          </View>

          <NeonButton
            title={loading ? '' : 'Create Account'}
            onPress={handleSignUp}
            disabled={loading}
            variant="primary"
            style={{ marginTop: 8 }}
          >
            {loading && <ActivityIndicator color="#000" />}
          </NeonButton>

          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.terms}>
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 28 },
  backBtn: { marginBottom: 32, alignSelf: 'flex-start', padding: 4 },
  backText: { color: Colors.cyan, fontSize: 17, fontWeight: '600' },
  title: { fontSize: 34, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.8, lineHeight: 40, marginBottom: 12 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 32 },
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
  inputWrapValid: { borderColor: '#00D26A' },
  inputWrapError: { borderColor: '#FF6B6B' },
  input: { flex: 1, height: 52, fontSize: 16, color: Colors.textPrimary },
  eyeBtn: { padding: 8 },
  eyeText: { fontSize: 18 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  loginPrompt: { color: Colors.textMuted, fontSize: 15 },
  loginLink: { color: Colors.cyan, fontSize: 15, fontWeight: '700' },
  terms: { marginTop: 20, color: Colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
