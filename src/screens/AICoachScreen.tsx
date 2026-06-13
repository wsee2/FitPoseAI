import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect as SvgRect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, BorderRadius } from '../theme';
import { useApp } from '../context/AppContext';
import type { CoachStackParamList } from '../navigation/types';

type Props = { navigation: NativeStackNavigationProp<CoachStackParamList, 'AICoach'> };

interface Message {
  id: string;
  role: 'coach' | 'user';
  text: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  '💪 Motivate me',
  '📊 Review my progress',
  '🎯 Suggest a workout',
  '❓ Improve my form',
];

const COACH_RESPONSES: Record<string, string> = {
  'motivate': "You're doing incredible! Every rep is building a stronger version of you. The fact you showed up today puts you ahead of 90% of people. Let's crush this! 🔥",
  'progress': "Looking at your data — you've completed 8 workouts this week with an average score of 83. Your squat form has improved significantly. Keep this momentum going! 📈",
  'workout': "Based on your history, I'd recommend focusing on squats and lunges today. Your lower body strength is developing nicely, and these exercises will complement your recent push-up sessions. Aim for 3 sets of 15 reps. 💪",
  'form': "For better form, focus on: 1) Keep your chest up during squats, 2) Breathe out on the push phase, 3) Engage your core throughout. Small adjustments make a big difference! ✨",
  'default': "That's a great question! Based on your fitness profile and recent workouts, I'd suggest focusing on consistency and progressive overload. Would you like me to create a personalized plan? 🤖",
};

const CoachAvatar = ({ size = 80, animated = false }: { size?: number; animated?: boolean }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (animated) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [animated]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <View style={[{ width: size, height: size }, styles.avatarOuter]}>
        <LinearGradient colors={['#001A33', '#000D1A']} style={[{ width: size, height: size, borderRadius: size / 2 }, styles.avatarInner]}>
          <Svg width={size * 0.65} height={size * 0.65} viewBox="0 0 52 52" fill="none">
            {/* Robot head */}
            <SvgRect x="10" y="12" width="32" height="26" rx="6" stroke={Colors.cyan} strokeWidth="2" fill="rgba(0,229,255,0.08)" />
            {/* Eyes */}
            <Circle cx="20" cy="23" r="4" fill={Colors.cyan} />
            <Circle cx="32" cy="23" r="4" fill={Colors.cyan} />
            <Circle cx="20" cy="23" r="2" fill={Colors.textPrimary} />
            <Circle cx="32" cy="23" r="2" fill={Colors.textPrimary} />
            {/* Mouth */}
            <Path d="M18 32 Q26 37 34 32" stroke={Colors.cyan} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            {/* Antenna */}
            <Path d="M26 12 L26 6" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" />
            <Circle cx="26" cy="5" r="2.5" fill={Colors.cyan} />
            {/* Ears */}
            <SvgRect x="6" y="20" width="4" height="10" rx="2" fill={Colors.cyan} fillOpacity="0.6" />
            <SvgRect x="42" y="20" width="4" height="10" rx="2" fill={Colors.cyan} fillOpacity="0.6" />
          </Svg>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};


export default function AICoachScreen({ navigation }: Props) {
  const { profile, workoutHistory } = useApp();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'coach',
      text: `Hey ${profile?.name?.split(' ')[0] ?? 'there'}! I'm your AI fitness coach. I've been tracking your progress — you've had a strong week! What can I help you with today? 💪`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isTyping) {
      const animDot = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          ])
        );
      Animated.parallel([animDot(typingDot1, 0), animDot(typingDot2, 150), animDot(typingDot3, 300)]).start();
    }
  }, [isTyping]);

  const getCoachResponse = (userInput: string): string => {
    const lower = userInput.toLowerCase();
    if (lower.includes('motivat')) return COACH_RESPONSES.motivate;
    if (lower.includes('progress') || lower.includes('review')) return COACH_RESPONSES.progress;
    if (lower.includes('workout') || lower.includes('suggest') || lower.includes('plan')) return COACH_RESPONSES.workout;
    if (lower.includes('form') || lower.includes('improve')) return COACH_RESPONSES.form;
    return COACH_RESPONSES.default;
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
    setTimeout(() => {
      setIsTyping(false);
      const coachMsg: Message = { id: (Date.now() + 1).toString(), role: 'coach', text: getCoachResponse(text), timestamp: new Date() };
      setMessages(prev => [...prev, coachMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 1800);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt.replace(/^[^\s]+\s/, ''));
  };

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.coachInfo}>
            <CoachAvatar size={48} animated />
            <View>
              <Text style={styles.coachName}>FitPose AI Coach</Text>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online · Always available</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.voiceBtn}>
            <Text style={styles.voiceIcon}>🎤</Text>
          </TouchableOpacity>
        </View>

        {/* Streak banner */}
        <View style={styles.streakBanner}>
          <LinearGradient colors={['rgba(0,229,255,0.1)', 'transparent']} style={styles.streakGrad}>
            <Text style={styles.streakText}>🔥 {profile?.streak ?? 14} day streak · {workoutHistory.length} sessions logged</Text>
          </LinearGradient>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => (
            <View key={msg.id} style={[styles.messageRow, msg.role === 'user' && styles.messageRowUser]}>
              {msg.role === 'coach' && <CoachAvatar size={36} />}
              {msg.role === 'user' ? (
                <LinearGradient colors={[Colors.cyan, '#0066FF']} style={[styles.bubble, styles.userBubble]}>
                  <Text style={[styles.bubbleText, styles.userBubbleText]}>{msg.text}</Text>
                  <Text style={[styles.bubbleTime, { color: 'rgba(0,0,0,0.5)' }]}>{formatTime(msg.timestamp)}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.bubble, styles.coachBubble]}>
                  <Text style={[styles.bubbleText, styles.coachBubbleText]}>{msg.text}</Text>
                  <Text style={styles.bubbleTime}>{formatTime(msg.timestamp)}</Text>
                </View>
              )}
            </View>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <View style={[styles.messageRow]}>
              <CoachAvatar size={36} />
              <View style={styles.typingBubble}>
                {[typingDot1, typingDot2, typingDot3].map((dot, i) => (
                  <Animated.View
                    key={i}
                    style={[styles.typingDot, { transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick prompts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickPromptsContent}
          style={styles.quickPrompts}
        >
          {QUICK_PROMPTS.map((p) => (
            <TouchableOpacity key={p} style={styles.quickPrompt} onPress={() => handleQuickPrompt(p)}>
              <Text style={styles.quickPromptText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Ask your AI coach…"
              placeholderTextColor={Colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim()}
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          >
            <LinearGradient
              colors={input.trim() ? [Colors.cyan, '#0066FF'] : [Colors.border, Colors.border]}
              style={styles.sendBtnGrad}
            >
              <Text style={[styles.sendIcon, input.trim() ? styles.sendIconActive : styles.sendIconDisabled]}>▶</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  coachInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarOuter: { borderRadius: 999, borderWidth: 2, borderColor: Colors.cyanGlow, shadowColor: Colors.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  avatarInner: { alignItems: 'center', justifyContent: 'center' },
  coachName: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success },
  onlineText: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  voiceBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.cyanGlow, alignItems: 'center', justifyContent: 'center' },
  voiceIcon: { fontSize: 18 },
  streakBanner: { marginHorizontal: 20, marginBottom: 8, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.cyanGlow },
  streakGrad: { paddingVertical: 8, paddingHorizontal: 14 },
  streakText: { fontSize: 12, color: Colors.cyan, fontWeight: '600' },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowUser: { flexDirection: 'row-reverse' },
  bubble: { maxWidth: '75%', borderRadius: 20, padding: 12, paddingHorizontal: 16 },
  coachBubble: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  userBubble: { borderBottomRightRadius: 4 },
  coachBubbleText: { color: Colors.textPrimary },
  userBubbleText: { color: Colors.textInverse },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: Colors.border },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.textMuted },
  quickPrompts: { maxHeight: 48, marginBottom: 8 },
  quickPromptsContent: { paddingHorizontal: 16, gap: 8 },
  quickPrompt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  quickPromptText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  inputBar: { paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  inputContainer: { flex: 1, backgroundColor: Colors.card, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, maxHeight: 120 },
  textInput: { fontSize: 15, color: Colors.textPrimary },
  sendBtn: { borderRadius: 22, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnGrad: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  sendIcon: { fontSize: 14, fontWeight: '800', marginLeft: 2 },
  sendIconActive: { color: Colors.textInverse },
  sendIconDisabled: { color: Colors.textMuted },
});
