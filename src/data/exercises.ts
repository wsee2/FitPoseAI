export type ExerciseId = 'squat' | 'pushup' | 'lunge' | 'plank' | 'situp';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface Exercise {
  id: ExerciseId;
  name: string;
  description: string;
  difficulty: Difficulty;
  targetMuscles: string[];
  calories: number; // per rep
  duration?: number; // for timed exercises in seconds
  accentColor: string;
  gradientColors: readonly [string, string];
  instructions: string[];
  tips: string[];
}

export interface WorkoutSession {
  id: string;
  exerciseId: ExerciseId;
  date: string;
  reps: number;
  duration: number; // seconds
  score: number; // 0-100
  calories: number;
  formQuality: 'Excellent' | 'Good' | 'Fair' | 'Needs Work';
  source?: 'live' | 'video';
  // Number of sets actually completed in this session. Optional — absent on any session
  // saved before multi-set support (or if only a single set was ever run), so consumers
  // must treat a missing value as "1 set" rather than requiring it.
  sets?: number;
  // Per-set breakdown, in order — reps for most exercises, held seconds for plank (same
  // reps-field overload as the top-level `reps`/formatRepsOrHold convention). Optional and
  // ONLY ever written for genuine multi-set sessions (length > 1) — never written as an
  // explicit `undefined` (Firebase RTDB's `push`/`set` reject any property valued
  // `undefined`), so its plain absence means "1 set" / "pre-multi-set session", same as `sets`.
  setDetails?: number[];
}

export const EXERCISES: Record<ExerciseId, Exercise> = {
  squat: {
    id: 'squat',
    name: 'Squat',
    description: 'The king of lower body exercises. Builds strength in quads, hamstrings, and glutes.',
    difficulty: 'Beginner',
    targetMuscles: ['Quadriceps', 'Hamstrings', 'Glutes', 'Core'],
    calories: 0.32,
    accentColor: '#00E5FF',
    gradientColors: ['#00E5FF', '#0066FF'],
    instructions: [
      'Stand with feet shoulder-width apart',
      'Keep your chest up and core engaged',
      'Lower until thighs are parallel to floor',
      'Push through heels to return to start',
    ],
    tips: [
      'Keep knees aligned over toes',
      'Don\'t let heels lift off the ground',
      'Breathe in on the way down',
    ],
  },
  pushup: {
    id: 'pushup',
    name: 'Push-up',
    description: 'A classic upper body compound movement targeting chest, shoulders and triceps.',
    difficulty: 'Beginner',
    targetMuscles: ['Chest', 'Shoulders', 'Triceps', 'Core'],
    calories: 0.29,
    accentColor: '#FF8A00',
    gradientColors: ['#FF8A00', '#FF4D4F'],
    instructions: [
      'Start in high plank with hands shoulder-width apart',
      'Lower chest toward the floor',
      'Keep elbows at 45-degree angle from body',
      'Push back up to starting position',
    ],
    tips: [
      'Keep body in a straight line',
      'Don\'t sag your hips',
      'Fully extend arms at the top',
    ],
  },
  lunge: {
    id: 'lunge',
    name: 'Lunge',
    description: 'A unilateral exercise that improves balance, strength and coordination.',
    difficulty: 'Beginner',
    targetMuscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Calves'],
    calories: 0.31,
    accentColor: '#00D26A',
    gradientColors: ['#00D26A', '#00E5FF'],
    instructions: [
      'Stand with feet hip-width apart',
      'Step forward with one leg',
      'Lower back knee toward the floor',
      'Push off front foot to return',
    ],
    tips: [
      'Keep front knee over ankle',
      'Maintain upright torso',
      'Alternate legs for balance',
    ],
  },
  plank: {
    id: 'plank',
    name: 'Plank',
    description: 'An isometric core strength exercise that also improves posture and stability.',
    difficulty: 'Beginner',
    targetMuscles: ['Core', 'Shoulders', 'Glutes', 'Back'],
    calories: 0.15,
    duration: 60,
    accentColor: '#FFB800',
    gradientColors: ['#FFB800', '#FF8A00'],
    instructions: [
      'Start in forearm plank position',
      'Elbows directly below shoulders',
      'Keep body in a straight line',
      'Hold the position for time',
    ],
    tips: [
      'Don\'t let hips sag or rise',
      'Breathe steadily throughout',
      'Engage glutes for stability',
    ],
  },
  situp: {
    id: 'situp',
    name: 'Sit-up',
    description: 'A core abdominal exercise that strengthens the rectus abdominis and hip flexors.',
    difficulty: 'Beginner',
    targetMuscles: ['Abdominals', 'Hip Flexors', 'Core'],
    calories: 0.25,
    accentColor: '#FF4D4F',
    gradientColors: ['#FF4D4F', '#FF8A00'],
    instructions: [
      'Lie on your back with knees bent',
      'Place hands behind or across chest',
      'Engage core and lift torso up',
      'Lower back down with control',
    ],
    tips: [
      'Don\'t pull on your neck',
      'Focus on engaging abs',
      'Controlled movement both ways',
    ],
  },
};

export const MOCK_HISTORY: WorkoutSession[] = [
  { id: '1', exerciseId: 'squat', date: '2026-06-12', reps: 30, duration: 240, score: 88, calories: 96, formQuality: 'Excellent' },
  { id: '2', exerciseId: 'pushup', date: '2026-06-12', reps: 20, duration: 180, score: 75, calories: 58, formQuality: 'Good' },
  { id: '3', exerciseId: 'plank', date: '2026-06-11', reps: 3, duration: 180, score: 92, calories: 27, formQuality: 'Excellent' },
  { id: '4', exerciseId: 'lunge', date: '2026-06-11', reps: 24, duration: 200, score: 81, calories: 74, formQuality: 'Good' },
  { id: '5', exerciseId: 'situp', date: '2026-06-10', reps: 25, duration: 210, score: 70, calories: 63, formQuality: 'Fair' },
  { id: '6', exerciseId: 'squat', date: '2026-06-09', reps: 28, duration: 230, score: 84, calories: 90, formQuality: 'Good' },
  { id: '7', exerciseId: 'pushup', date: '2026-06-08', reps: 18, duration: 170, score: 68, calories: 52, formQuality: 'Fair' },
  { id: '8', exerciseId: 'lunge', date: '2026-06-07', reps: 20, duration: 190, score: 79, calories: 62, formQuality: 'Good' },
];

export const WEEKLY_DATA = [
  { day: 'Mon', score: 84, reps: 28 },
  { day: 'Tue', score: 70, reps: 18 },
  { day: 'Wed', score: 0, reps: 0 },
  { day: 'Thu', score: 79, reps: 20 },
  { day: 'Fri', score: 81, reps: 24 },
  { day: 'Sat', score: 92, reps: 30 },
  { day: 'Sun', score: 75, reps: 20 },
];

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// session.reps is overloaded: for plank it's held seconds (see WorkoutScreen's
// getFinalStats), for every other exercise it's an actual rep count. Mirrors the same
// distinction aiCoach.ts's buildHistorySummary already makes for the AI coach's context.
export const formatRepsOrHold = (session: WorkoutSession): string =>
  session.exerciseId === 'plank' ? `${session.reps}s hold` : `${session.reps} reps`;

export const getScoreGrade = (score: number): { grade: string; color: string } => {
  if (score >= 90) return { grade: 'S', color: '#00E5FF' };
  if (score >= 80) return { grade: 'A', color: '#00D26A' };
  if (score >= 70) return { grade: 'B', color: '#FFB800' };
  if (score >= 60) return { grade: 'C', color: '#FF8A00' };
  return { grade: 'D', color: '#FF4D4F' };
};
