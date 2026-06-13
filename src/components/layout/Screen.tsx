import React from 'react';
import { View, StyleSheet, ScrollView, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../theme';

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  scrollable = false,
  style,
  contentStyle,
  edges = ['top', 'bottom'],
}) => {
  if (scrollable) {
    return (
      <SafeAreaView style={[styles.container, style]} edges={edges}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, style]} edges={edges}>
      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
