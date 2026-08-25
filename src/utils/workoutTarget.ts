import type { ExerciseId } from '../data/exercises';
import type { ExperienceLevel } from '../context/AppContext';

// Rep-count target by experience level — seeds the pre-workout stepper's default
// (ExerciseSelectScreen) and drives encouragementService's halfway/near-end/target-reached
// milestone math. Purely advisory: reaching it never auto-stops the workout (see
// WorkoutScreen's Finish flow, untouched by this).
export const DEFAULT_REP_TARGETS: Record<ExperienceLevel, number> = {
  beginner: 8,
  intermediate: 12,
  advanced: 15,
};

// Plank target in SECONDS held — same role as above, for the one time-based exercise.
export const DEFAULT_PLANK_TARGET_SECONDS: Record<ExperienceLevel, number> = {
  beginner: 20,
  intermediate: 40,
  advanced: 60,
};

export const REP_TARGET_STEP = 1;
export const REP_TARGET_MIN = 3;
export const REP_TARGET_MAX = 50;

export const PLANK_TARGET_STEP_SECONDS = 5;
export const PLANK_TARGET_MIN_SECONDS = 10;
export const PLANK_TARGET_MAX_SECONDS = 180;

/** The experience-based default target for this exercise — reps for most, seconds for plank. */
export function getDefaultTarget(exerciseId: ExerciseId, level: ExperienceLevel): number {
  return exerciseId === 'plank' ? DEFAULT_PLANK_TARGET_SECONDS[level] : DEFAULT_REP_TARGETS[level];
}

// Sets per session — same "advisory, adjustable, not persisted" treatment as the rep/time
// target. Not experience-level-dependent (unlike the target itself): 3 is a reasonable
// starting point for any level, since the per-set difficulty already scales with level.
export const DEFAULT_SETS = 3;
export const SETS_STEP = 1;
export const SETS_MIN = 1;
export const SETS_MAX = 10;
