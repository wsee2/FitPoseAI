import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  TouchableOpacity, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect, Line, Text as SvgText } from 'react-native-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Colors, Typography, Spacing, BorderRadius } from '../theme';
import { NeonButton } from '../components/ui/NeonButton';

const { width, height } = Dimensions.get('window');
type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'> };

const SLIDES = [
  {
    id: 0,
    label: 'AI Posture Analysis',
    title: 'Real-Time\nPose Detection',
    description: 'Advanced AI tracks your body in real time using MoveNet, analyzing every rep with precision.',
    accentColor: Colors.cyan,
    gradientColors: ['rgba(0,229,255,0.08)', 'transparent'] as const,
    Illustration: () => (
      <Svg width={220} height={220} viewBox="0 0 220 220" fill="none">
        {/* Body silhouette */}
        <Circle cx="110" cy="52" r="22" stroke={Colors.cyan} strokeWidth="2.5" fill="none" />
        <Path d="M110 74 L110 130" stroke={Colors.cyan} strokeWidth="2.5" strokeLinecap="round" />
        <Path d="M72 100 L110 110 L148 100" stroke={Colors.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M110 130 L88 170 L80 200" stroke={Colors.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M110 130 L132 170 L140 200" stroke={Colors.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Joints */}
        {[
          [110, 52], [110, 74], [110, 110], [110, 130],
          [72, 100], [148, 100], [72, 138], [148, 138],
          [88, 170], [132, 170], [80, 200], [140, 200],
        ].map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={5} fill={Colors.cyan} fillOpacity="0.9" />
        ))}
        {/* Scan lines */}
        {[80, 110, 140, 170].map((y, i) => (
          <Line key={i} x1="20" y1={y} x2="200" y2={y}
            stroke={Colors.cyan} strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="4 6" />
        ))}
        {/* Corner markers */}
        <Path d="M30 30 L30 48 L48 48" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M190 30 L190 48 L172 48" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M30 190 L30 172 L48 172" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M190 190 L190 172 L172 172" stroke={Colors.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    ),
  },
  {
    id: 1,
    label: 'Smart Coaching',
    title: 'Live Feedback\nEvery Rep',
    description: 'Instant voice and visual coaching corrects your form before bad habits develop. Your AI trainer never sleeps.',
    accentColor: Colors.orange,
    gradientColors: ['rgba(255,138,0,0.08)', 'transparent'] as const,
    Illustration: () => (
      <Svg width={220} height={220} viewBox="0 0 220 220" fill="none">
        {/* AI Brain */}
        <Circle cx="110" cy="90" r="50" stroke={Colors.orange} strokeWidth="2" strokeDasharray="6 4" fill="none" />
        <Circle cx="110" cy="90" r="36" fill={`rgba(255,138,0,0.08)`} stroke={Colors.orange} strokeWidth="1.5" />
        {/* Neural nodes */}
        {[[110,54],[144,68],[156,90],[144,112],[110,126],[76,112],[64,90],[76,68]].map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={6} fill={Colors.orange} fillOpacity="0.8" />
        ))}
        <Circle cx="110" cy="90" r="10" fill={Colors.orange} />
        {/* Connections to center */}
        {[[110,54],[144,68],[156,90],[144,112],[110,126],[76,112],[64,90],[76,68]].map(([cx, cy], i) => (
          <Line key={i} x1={110} y1={90} x2={cx} y2={cy}
            stroke={Colors.orange} strokeWidth="1" strokeOpacity="0.4" />
        ))}
        {/* Speech bubbles */}
        <Rect x="140" y="140" width="66" height="32" rx="10" fill={`rgba(255,138,0,0.12)`} stroke={Colors.orange} strokeWidth="1.5" />
        <Path d="M148 140 L140 150" stroke={Colors.orange} strokeWidth="1.5" strokeLinecap="round" />
        <SvgText x="173" y="162" fontSize="11" fontWeight="700" fill={Colors.orange} textAnchor="middle">Good form!</SvgText>
        <Rect x="14" y="148" width="72" height="26" rx="10" fill={`rgba(0,229,255,0.08)`} stroke={Colors.cyan} strokeWidth="1.5" />
        <SvgText x="50" y="166" fontSize="11" fill={Colors.cyan} textAnchor="middle">Rep: 12 ✓</SvgText>
      </Svg>
    ),
  },
  {
    id: 2,
    label: 'Track Progress',
    title: 'Watch Yourself\nImprove',
    description: 'Detailed analytics, workout history, and AI insights show your journey from day one to peak performance.',
    accentColor: Colors.success,
    gradientColors: ['rgba(0,210,106,0.08)', 'transparent'] as const,
    Illustration: () => (
      <Svg width={220} height={220} viewBox="0 0 220 220" fill="none">
        {/* Chart area */}
        <Rect x="20" y="30" width="180" height="120" rx="12" fill="rgba(0,210,106,0.05)" stroke={Colors.border} strokeWidth="1" />
        {/* Grid lines */}
        {[60, 90, 120].map((y, i) => (
          <Line key={i} x1="30" y1={y} x2="190" y2={y} stroke={Colors.border} strokeWidth="0.8" />
        ))}
        {/* Bar chart */}
        {[
          { x: 40, h: 50, c: Colors.border },
          { x: 64, h: 65, c: Colors.success },
          { x: 88, h: 45, c: Colors.border },
          { x: 112, h: 72, c: Colors.success },
          { x: 136, h: 80, c: Colors.success },
          { x: 160, h: 90, c: Colors.cyan },
        ].map((bar, i) => (
          <Rect key={i} x={bar.x} y={140 - bar.h} width={18} height={bar.h} rx={6}
            fill={bar.c} fillOpacity="0.7" />
        ))}
        {/* Trend line */}
        <Path d="M49 115 L73 100 L97 108 L121 90 L145 76 L169 60"
          stroke={Colors.cyan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {[[49,115],[73,100],[97,108],[121,90],[145,76],[169,60]].map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={4} fill={Colors.cyan} />
        ))}
        {/* Stats row */}
        <Rect x="20" y="168" width="80" height="36" rx="10" fill={Colors.card} stroke={Colors.border} strokeWidth="1" />
        <SvgText x="60" y="182" fontSize="10" fill={Colors.textMuted} textAnchor="middle">Score</SvgText>
        <SvgText x="60" y="198" fontSize="16" fontWeight="800" fill={Colors.success} textAnchor="middle">92</SvgText>
        <Rect x="120" y="168" width="80" height="36" rx="10" fill={Colors.card} stroke={Colors.border} strokeWidth="1" />
        <SvgText x="160" y="182" fontSize="10" fill={Colors.textMuted} textAnchor="middle">Streak</SvgText>
        <SvgText x="160" y="198" fontSize="16" fontWeight="800" fill={Colors.gold} textAnchor="middle">14d</SvgText>
      </Svg>
    ),
  },
];

export default function OnboardingScreen({ navigation }: Props) {
  const [activeSlide, setActiveSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dotScale = useRef(SLIDES.map(() => new Animated.Value(1))).current;

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setActiveSlide(index);
    dotScale.forEach((s, i) => {
      Animated.spring(s, { toValue: i === index ? 1.4 : 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
    });
  };

  const handleNext = () => {
    if (activeSlide < SLIDES.length - 1) {
      goToSlide(activeSlide + 1);
    } else {
      navigation.replace('SignUp');
    }
  };

  const handleScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== activeSlide) {
      setActiveSlide(idx);
      dotScale.forEach((s, i) => {
        Animated.spring(s, { toValue: i === idx ? 1.4 : 1, useNativeDriver: true, tension: 200, friction: 10 }).start();
      });
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0A', '#0A0A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.replace('SignUp')}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.slider}
      >
        {SLIDES.map((slide) => (
          <View key={slide.id} style={styles.slide}>
            {/* Illustration */}
            <View style={styles.illustrationArea}>
              <LinearGradient
                colors={slide.gradientColors}
                style={styles.illustrationGlow}
              />
              <slide.Illustration />
            </View>

            {/* Content */}
            <View style={styles.content}>
              <View style={[styles.labelBadge, { backgroundColor: `${slide.accentColor}18`, borderColor: `${slide.accentColor}40` }]}>
                <Text style={[styles.labelText, { color: slide.accentColor }]}>{slide.label}</Text>
              </View>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i)}>
              <Animated.View
                style={[
                  styles.dot,
                  { transform: [{ scaleX: dotScale[i] }] },
                  i === activeSlide
                    ? { backgroundColor: SLIDES[activeSlide].accentColor, width: 24 }
                    : { backgroundColor: Colors.border, width: 8 },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <NeonButton
          title={activeSlide === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          onPress={handleNext}
          variant={activeSlide === SLIDES.length - 1 ? 'primary' : 'ghost'}
          style={{ marginHorizontal: 24 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  slider: {
    flex: 1,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  illustrationArea: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    position: 'relative',
  },
  illustrationGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  labelBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  bottomControls: {
    paddingBottom: 48,
    gap: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
