import { calculateAngle, getKeypoint, spineLeanAngle } from '../poseMath';

// MoveNet (COCO-17) keypoint indices used by this FSM.
// Ported from a MediaPipe (33-landmark) prototype — mapping: 11/12->5/6 (shoulders),
// 23/24->11/12 (hips), 25/26->13/14 (knees), 27/28->15/16 (ankles).
const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER = 6;
const LEFT_HIP = 11;
const RIGHT_HIP = 12;
const LEFT_KNEE = 13;
const RIGHT_KNEE = 14;
const LEFT_ANKLE = 15;
const RIGHT_ANKLE = 16;

// Tested thresholds ported exactly from the Python prototype — do not retune without re-validating there.
const STANDING_ANGLE = 165;
const BOTTOM_ANGLE = 95;
const TOO_LOW_ANGLE = 65;
const PERFECT_MIN = 70;
const PERFECT_MAX = 95;
const FOOT_DIFF_DOWN = 0.06;
const FOOT_DIFF_BAD = 0.08;
const KNEE_SYM_DOWN = 25;
const KNEE_SYM_BAD = 30;
const LEAN_BAD = 50;
const SMOOTH_WINDOW = 5;
const CONF_THRESHOLD = 0.3;

export type SquatStage = 'UP' | 'DOWN' | null;

export interface SquatFsmState {
  stage: SquatStage;
  counter: number;
  score: number;
  feedback: string;
  kneeAngle: number | null;
}

export const INITIAL_SQUAT_STATE: SquatFsmState = {
  stage: null,
  counter: 0,
  score: 0,
  feedback: 'Get ready',
  kneeAngle: null,
};

export class SquatFsm {
  private stage: SquatStage = null;
  private counter = 0;
  private score = 0;
  private squatFormGood = false;
  private smoothBuffer: number[] = [];
  private lastState: SquatFsmState = INITIAL_SQUAT_STATE;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.squatFormGood = false;
    this.smoothBuffer = [];
    this.lastState = INITIAL_SQUAT_STATE;
  }

  /** Feed one frame of MoveNet keypoints (flattened length-51 array). */
  update(keypoints: number[]): SquatFsmState {
    const shoulderL = getKeypoint(keypoints, LEFT_SHOULDER);
    const shoulderR = getKeypoint(keypoints, RIGHT_SHOULDER);
    const hipL = getKeypoint(keypoints, LEFT_HIP);
    const hipR = getKeypoint(keypoints, RIGHT_HIP);
    const kneeL = getKeypoint(keypoints, LEFT_KNEE);
    const kneeR = getKeypoint(keypoints, RIGHT_KNEE);
    const ankleL = getKeypoint(keypoints, LEFT_ANKLE);
    const ankleR = getKeypoint(keypoints, RIGHT_ANKLE);

    const required = [shoulderL, shoulderR, hipL, hipR, kneeL, kneeR, ankleL, ankleR];
    if (required.some((p) => p.conf < CONF_THRESHOLD)) {
      // Low-confidence frame (e.g. body partially out of view) — don't miscount, just hold.
      return this.lastState;
    }

    const angleL = calculateAngle(hipL, kneeL, ankleL);
    const angleR = calculateAngle(hipR, kneeR, ankleR);
    const rawKneeAngle = (angleL + angleR) / 2;

    this.smoothBuffer.push(rawKneeAngle);
    if (this.smoothBuffer.length > SMOOTH_WINDOW) this.smoothBuffer.shift();
    const angle =
      this.smoothBuffer.reduce((sum, v) => sum + v, 0) / this.smoothBuffer.length;

    const leanL = spineLeanAngle(shoulderL, hipL);
    const leanR = spineLeanAngle(shoulderR, hipR);
    const lean = (leanL + leanR) / 2;

    const footDiff = Math.abs(ankleL.y - ankleR.y);
    const kneeSym = Math.abs(angleL - angleR);

    if (angle > STANDING_ANGLE) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.squatFormGood ? 10 : 5;
      }
      this.stage = 'UP';
    }
    if (
      this.stage === 'UP' &&
      angle < BOTTOM_ANGLE &&
      footDiff < FOOT_DIFF_DOWN &&
      kneeSym < KNEE_SYM_DOWN
    ) {
      this.stage = 'DOWN';
      this.squatFormGood = angle >= PERFECT_MIN && angle <= PERFECT_MAX && lean < LEAN_BAD;
    }

    const excessiveLean = lean > LEAN_BAD && angle < 155;
    let feedback: string;
    if (footDiff > FOOT_DIFF_BAD) {
      feedback = 'Keep both feet level';
    } else if (excessiveLean) {
      feedback = 'Lean back - straighten';
    } else if (kneeSym > KNEE_SYM_BAD && angle < 155) {
      feedback = 'Distribute weight evenly';
    } else if (angle > STANDING_ANGLE) {
      feedback = 'Go Down';
    } else if (angle < TOO_LOW_ANGLE) {
      feedback = 'Too Low - rise slightly';
    } else if (angle >= PERFECT_MIN && angle <= PERFECT_MAX) {
      feedback = 'Perfect Squat Depth';
    } else {
      feedback = 'Keep Going Down';
    }

    this.lastState = {
      stage: this.stage,
      counter: this.counter,
      score: this.score,
      feedback,
      kneeAngle: angle,
    };
    return this.lastState;
  }
}
