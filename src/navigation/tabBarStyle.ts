import { Colors } from '../theme';

// Shared between AppNavigator (default tabBarStyle) and WorkoutScreen (which hides the tab
// bar on focus and must restore this exact style on blur). Kept in its own module rather than
// exported from AppNavigator.tsx to avoid a circular import (AppNavigator -> WorkoutScreen ->
// AppNavigator) — `setOptions({ tabBarStyle: undefined })` does NOT fall back to
// AppNavigator's function-based screenOptions default, it falls back to the library's bare
// (white) default, so WorkoutScreen must reconstruct the real style instead.
export function getDefaultTabBarStyle(insetsBottom: number) {
  return {
    position: 'absolute' as const,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    elevation: 8,
    height: 60 + insetsBottom,
    paddingBottom: insetsBottom,
  };
}
