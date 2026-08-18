import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, BackHandler,
  Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Reanimated, {
  useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, BorderRadius } from '../theme';
import { useApp } from '../context/AppContext';
import {
  createChatSession, sendChatMessage, updateCurrentSessionContext,
  type ChatSession, type CurrentSessionContext,
} from '../services/aiCoach';
import { todayMYTDateStr } from '../utils/mytDate';
import CoachAvatarCircle from './CoachAvatarCircle';

interface Message {
  id: string;
  role: 'coach' | 'user';
  text: string;
  timestamp: Date;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  /** Current session's progress as of the moment of pausing, e.g. "6 reps so far" or "1:12 held so far". */
  currentProgressLabel: string;
}

/**
 * Tap-to-chat overlay for WorkoutScreen. Rendered unconditionally (visibility controlled by
 * the `visible` prop, not conditional mounting) so the chat session and message history
 * survive if the user opens/closes it more than once during the same workout.
 */
export default function WorkoutChatOverlay({ visible, onClose, exerciseName, currentProgressLabel }: Props) {
  const { workoutHistory } = useApp();
  const insets = useSafeAreaInsets();
  const chatRef = useRef<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;

  // Native-driven keyboard height, correctly accounts for edge-to-edge display mode
  // (this app's android.edgeToEdgeEnabled: true).
  const keyboard = useAnimatedKeyboard();
  const sheetAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      paddingBottom: keyboard.height.value > 0 ? keyboard.height.value : insets.bottom,
    };
  });

  // Show/hide animation (replaces the transparent-Modal slide). Backdrop fades in; sheet
  // slides up from below the screen. Component stays mounted at all times (see comment
  // above) — pointerEvents is what actually gates interaction when hidden.
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(400);
  useEffect(() => {
    backdropOpacity.value = withTiming(visible ? 1 : 0, { duration: 220 });
    sheetTranslateY.value = withTiming(visible ? 0 : 400, { duration: 250 });
  }, [visible, backdropOpacity, sheetTranslateY]);
  const backdropAnimatedStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const slideAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  // Android hardware/gesture back button — Modal used to handle this via onRequestClose;
  // now that this is a plain in-tree overlay, it must be wired up explicitly.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // On first open, seed the chat session (reused for every subsequent open/close so history
  // persists). On every re-open after that, refresh the coach's awareness of the current
  // session's progress — the rep/hold count has moved on since the chat was last open.
  useEffect(() => {
    if (!visible) return;
    const current: CurrentSessionContext = {
      exerciseName,
      progressLabel: currentProgressLabel,
      date: todayMYTDateStr(),
    };
    if (!chatRef.current) {
      chatRef.current = createChatSession(workoutHistory, current);
      setMessages([{
        id: 'greeting',
        role: 'coach',
        text: `Paused your ${exerciseName.toLowerCase()} session — ask me anything, and we'll pick it back up when you close this.`,
        timestamp: new Date(),
      }]);
    } else {
      updateCurrentSessionContext(chatRef.current, current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
  }, [isTyping, typingDot1, typingDot2, typingDot3]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const reply = await sendChatMessage(chatRef.current, text);
    setIsTyping(false);
    setMessages(prev => [...prev, { id: Date.now().toString() + '-c', role: 'coach', text: reply, timestamp: new Date() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [input, isTyping]);

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <Reanimated.View
      style={[styles.backdrop, backdropAnimatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheetWrapper} pointerEvents="box-none">
        <Reanimated.View style={[styles.sheet, sheetAnimatedStyle, slideAnimatedStyle]}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <CoachAvatarCircle size={40} expression={isTyping ? 1 : 2} />
                <View>
                  <Text style={styles.coachName}>FitPose AI Coach</Text>
                  <View style={styles.pausedRow}>
                    <View style={styles.pausedDot} />
                    <Text style={styles.pausedText}>⏸ Workout Paused</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((msg) => (
                <View key={msg.id} style={[styles.messageRow, msg.role === 'user' && styles.messageRowUser]}>
                  <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.coachBubble]}>
                    <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userBubbleText : styles.coachBubbleText]}>
                      {msg.text}
                    </Text>
                    <Text style={styles.bubbleTime}>{formatTime(msg.timestamp)}</Text>
                  </View>
                </View>
              ))}
              {isTyping && (
                <View style={styles.messageRow}>
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

            <View style={styles.inputBar}>
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
                  editable={!isTyping}
                />
              </View>
              <TouchableOpacity
                onPress={handleSend}
                disabled={!input.trim() || isTyping}
                style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
              >
                <Text style={[styles.sendIcon, input.trim() && !isTyping ? styles.sendIconActive : styles.sendIconDisabled]}>▶</Text>
              </TouchableOpacity>
            </View>
        </Reanimated.View>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // Absolutely positioned in-tree overlay (not a native Modal — see comment above the
  // BackHandler effect) so it participates in the same window/keyboard resize behavior as
  // the rest of WorkoutScreen. zIndex keeps it above the coach-robot button (zIndex 1001).
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    zIndex: 2000,
  },
  sheetWrapper: { maxHeight: '82%' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 0,
    height: '100%',
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  pausedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  pausedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  pausedText: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  messageRow: { flexDirection: 'row' },
  messageRowUser: { flexDirection: 'row-reverse' },
  bubble: { maxWidth: '85%', borderRadius: 20, padding: 12, paddingHorizontal: 16 },
  coachBubble: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: Colors.cyan, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  coachBubbleText: { color: Colors.textPrimary },
  userBubbleText: { color: Colors.textInverse },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.card, borderRadius: 20, padding: 14, paddingHorizontal: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.textMuted },
  inputBar: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 8,
  },
  inputContainer: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 22,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 8, maxHeight: 120,
  },
  textInput: { fontSize: 15, color: Colors.textPrimary },
  sendBtn: {
    width: 46, height: 46, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cyan,
  },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendIcon: { fontSize: 14, fontWeight: '800', marginLeft: 2 },
  sendIconActive: { color: Colors.textInverse },
  sendIconDisabled: { color: Colors.textMuted },
});
