import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Animated, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect as SvgRect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Colors, BorderRadius } from '../theme';
import { useApp } from '../context/AppContext';
import CoachAvatarCircle from '../components/CoachAvatarCircle';
import { createChatSession, sendChatMessage, getTrendMessage } from '../services/aiCoach';
import type { CoachStackParamList } from '../navigation/types';

type Props = { navigation: NativeStackNavigationProp<CoachStackParamList, 'AICoach'> };

interface Message {
  id: string;
  role: 'coach' | 'user';
  text: string;
  timestamp: Date;
  isProactive?: boolean;
}

const QUICK_PROMPTS = [
  { label: '💪 Motivate me', text: 'Motivate me to work out today!' },
  { label: '📊 My progress', text: 'Review my recent progress.' },
  { label: '🎯 Workout plan', text: 'Suggest a workout plan for this week.' },
  { label: '❓ Improve form', text: 'How can I improve my exercise form?' },
];

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
            <SvgRect x="10" y="12" width="32" height="26" rx="6" stroke={Colors.cyan} strokeWidth="2" fill="rgba(0,229,255,0.08)" />
            <Circle cx="20" cy="23" r="4" fill={Colors.cyan} />
            <Circle cx="32" cy="23" r="4" fill={Colors.cyan} />
            <Circle cx="20" cy="23" r="2" fill={Colors.textPrimary} />
            <Circle cx="32" cy="23" r="2" fill={Colors.textPrimary} />
            <Path d="M18 32 Q26 37 34 32" stroke={Colors.cyan} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <Path d="M26 12 L26 6" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" />
            <Circle cx="26" cy="5" r="2.5" fill={Colors.cyan} />
            <SvgRect x="6" y="20" width="4" height="10" rx="2" fill={Colors.cyan} fillOpacity="0.6" />
            <SvgRect x="42" y="20" width="4" height="10" rx="2" fill={Colors.cyan} fillOpacity="0.6" />
          </Svg>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

export default function AICoachScreen({ navigation }: Props) {
  const { profile, workoutHistory, lastCoachMessage, setLastCoachMessage } = useApp();
  const insets = useSafeAreaInsets();
  const chatRef = useRef<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;
  const [coachExpression, setCoachExpression] = useState(1);
  const prevIsTypingRef = useRef(false);
  const expressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On Android with edgeToEdgeEnabled the OS doesn't resize the window when the keyboard opens,
  // so KeyboardAvoidingView has no effect. Instead we read the keyboard height and apply it as
  // paddingBottom on the container — this compresses the flex column and lifts the input bar
  // to sit directly above the keyboard. When the keyboard closes the padding returns to 0.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Capture initial values so the mount effect doesn't need dynamic deps.
  const initialHistoryRef = useRef(workoutHistory);
  const initialCoachMsgRef = useRef(lastCoachMessage);
  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  useEffect(() => {
    // Initialize chat session seeded with user history.
    chatRef.current = createChatSession(initialHistoryRef.current);

    const greeting: Message = {
      id: 'greeting',
      role: 'coach',
      text: `Hey ${firstName}! I'm your AI fitness coach. I've been tracking your progress — ${
        initialHistoryRef.current.length
          ? `you have ${initialHistoryRef.current.length} session${initialHistoryRef.current.length > 1 ? 's' : ''} logged`
          : "let's get started"
      }. What can I help you with today? 💪`,
      timestamp: new Date(),
    };

    const initial: Message[] = [greeting];

    // Show post-workout proactive message if available.
    if (initialCoachMsgRef.current) {
      initial.push({
        id: 'post-workout',
        role: 'coach',
        text: initialCoachMsgRef.current,
        timestamp: new Date(),
        isProactive: true,
      });
      setLastCoachMessage(null);
    }

    setMessages(initial);

    // Fetch trend message (rate-limited in the service — won't spam).
    getTrendMessage(initialHistoryRef.current).then(msg => {
      if (!msg) return;
      setMessages(prev => [
        ...prev,
        { id: 'trend', role: 'coach', text: msg, timestamp: new Date(), isProactive: true },
      ]);
    }).catch(() => {});
  }, []);

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

  // Drive coach robot: Smiling while AI is typing, Happy for 2s when reply arrives.
  useEffect(() => {
    if (expressionTimerRef.current) {
      clearTimeout(expressionTimerRef.current);
      expressionTimerRef.current = null;
    }
    if (isTyping) {
      setCoachExpression(1);
    } else if (prevIsTypingRef.current) {
      setCoachExpression(2);
      expressionTimerRef.current = setTimeout(() => setCoachExpression(1), 2000);
    }
    prevIsTypingRef.current = isTyping;
    return () => {
      if (expressionTimerRef.current) clearTimeout(expressionTimerRef.current);
    };
  }, [isTyping]);

  const handleCopy = useCallback((text: string, id: string) => {
    Clipboard.setStringAsync(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500);
  }, []);

  const addCoachMessage = useCallback((text: string, isProactive = false) => {
    const msg: Message = {
      id: Date.now().toString(),
      role: 'coach',
      text,
      timestamp: new Date(),
      isProactive,
    };
    setMessages(prev => [...prev, msg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const reply = await sendChatMessage(chatRef.current, text);
    setIsTyping(false);
    addCoachMessage(reply);
  }, [input, isTyping, addCoachMessage]);

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Only the most recent coach message gets the animated Rive avatar (Galaxy S8 perf).
  // Older messages use the static SVG CoachAvatar.
  const lastCoachMsgId = messages.filter(m => m.role === 'coach').slice(-1)[0]?.id;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, Platform.OS === 'android' ? { paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0 } : undefined]}>
        <LinearGradient colors={['#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.coachInfo}>
            <CoachAvatarCircle size={48} expression={coachExpression} />
            <View>
              <Text style={styles.coachName}>FitPose AI Coach</Text>
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online · GPT-4o Mini</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Streak banner */}
        <View style={styles.streakBanner}>
          <LinearGradient colors={['rgba(0,229,255,0.1)', 'transparent']} style={styles.streakGrad}>
            <Text style={styles.streakText}>
              🔥 {profile?.streak ?? 0} day streak · {workoutHistory.length} sessions logged
            </Text>
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
              {msg.role === 'coach' && (
                lastCoachMsgId === msg.id
                  ? <CoachAvatarCircle size={36} expression={coachExpression} />
                  : <CoachAvatar size={36} />
              )}
              <TouchableOpacity
                onLongPress={() => handleCopy(msg.text, msg.id)}
                delayLongPress={400}
                activeOpacity={0.75}
              >
                {msg.role === 'user' ? (
                  <LinearGradient colors={[Colors.cyan, '#0066FF']} style={[styles.bubble, styles.userBubble]}>
                    <Text style={[styles.bubbleText, styles.userBubbleText]}>{msg.text}</Text>
                    <Text style={[styles.bubbleTime, { color: 'rgba(0,0,0,0.5)' }]}>{formatTime(msg.timestamp)}</Text>
                    {copiedId === msg.id && <Text style={styles.copiedHint}>Copied ✓</Text>}
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.coachBubble, msg.isProactive && styles.proactiveBubble]}>
                    {msg.isProactive && (
                      <Text style={styles.proactiveLabel}>Coach Insight</Text>
                    )}
                    <Text style={[styles.bubbleText, styles.coachBubbleText]}>{msg.text}</Text>
                    <Text style={styles.bubbleTime}>{formatTime(msg.timestamp)}</Text>
                    {copiedId === msg.id && <Text style={styles.copiedHint}>Copied ✓</Text>}
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <View style={styles.messageRow}>
              <CoachAvatarCircle size={36} expression={coachExpression} />
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
            <TouchableOpacity
              key={p.label}
              style={[styles.quickPrompt, isTyping && styles.quickPromptDisabled]}
              onPress={() => !isTyping && handleSend(p.text)}
            >
              <Text style={styles.quickPromptText}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom + 72 }]}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Ask your AI coach…"
              placeholderTextColor={Colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              multiline
              editable={!isTyping}
            />
          </View>
          <TouchableOpacity
            onPress={() => handleSend()}
            disabled={!input.trim() || isTyping}
            style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
          >
            <LinearGradient
              colors={input.trim() && !isTyping ? [Colors.cyan, '#0066FF'] : [Colors.border, Colors.border]}
              style={styles.sendBtnGrad}
            >
              <Text style={[styles.sendIcon, input.trim() && !isTyping ? styles.sendIconActive : styles.sendIconDisabled]}>▶</Text>
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
  streakBanner: { marginHorizontal: 20, marginBottom: 8, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.cyanGlow },
  streakGrad: { paddingVertical: 8, paddingHorizontal: 14 },
  streakText: { fontSize: 12, color: Colors.cyan, fontWeight: '600' },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 12, paddingVertical: 3, gap: 12 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowUser: { flexDirection: 'row-reverse' },
  bubble: { maxWidth: '85%', borderRadius: 20, padding: 12, paddingHorizontal: 16 },
  coachBubble: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  proactiveBubble: { borderColor: Colors.cyanGlow, backgroundColor: 'rgba(0,229,255,0.06)' },
  proactiveLabel: { fontSize: 10, fontWeight: '700', color: Colors.cyan, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 },
  userBubble: { borderBottomRightRadius: 4 },
  coachBubbleText: { color: Colors.textPrimary },
  userBubbleText: { color: Colors.textInverse },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  copiedHint: { fontSize: 11, fontWeight: '600', color: Colors.cyan, marginTop: 4, alignSelf: 'flex-end' },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: Colors.border },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.textMuted },
  quickPrompts: { maxHeight: 40, marginBottom: 8 },
  quickPromptsContent: { paddingHorizontal: 16, gap: 8 },
  quickPrompt: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  quickPromptDisabled: { opacity: 0.4 },
  quickPromptText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  inputBar: { paddingHorizontal: 16, paddingTop: 3, flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  inputContainer: { flex: 1, backgroundColor: Colors.card, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 1, maxHeight: 120 },
  textInput: { fontSize: 15, color: Colors.textPrimary },
  sendBtn: { borderRadius: 22, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnGrad: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  sendIcon: { fontSize: 14, fontWeight: '800', marginLeft: 2 },
  sendIconActive: { color: Colors.textInverse },
  sendIconDisabled: { color: Colors.textMuted },
});
