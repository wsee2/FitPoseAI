import { calculateAngle, getKeypoint, spineLeanAngle, type Keypoint } from '../poseMath';

// MoveNet (COCO-17) keypoint indices used by this FSM.
const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER = 6;
const LEFT_HIP = 11;
const RIGHT_HIP = 12;
const LEFT_KNEE = 13;
const RIGHT_KNEE = 14;
const LEFT_ANKLE = 15;
const RIGHT_ANKLE = 16;

// Tested thresholds ported exactly from the Python prototype — do not retune without re-validating there.
const LEAN_DOWN_ANGLE = 60;
const FEET_PLANTED_LEAN_MAX = 62;
const LEAN_UP_ANGLE = 38;
const TRUNK_UP_ANGLE = 82;
const LEAN_PERFECT = 28;
const LEAN_GREAT = 30;
const KNEE_BENT_MIN = 75;
const KNEE_BENT_MAX = 150;
const CLASSIC_SYM_DIFF = 30;
const SMOOTH_WINDOW = 5;
const CONF_THRESHOLD = 0.3;

export type SitupStage = 'UP' | 'DOWN' | null;

export interface SitupFsmState {
  stage: SitupStage;
  counter: number;
  score: number;
  feedback: string;
  leanAngle: number | null;
}

export const INITIAL_SITUP_STATE: SitupFsmState = {
  stage: null,
  counter: 0,
  score: 0,
  feedback: 'Get ready',
  leanAngle: null,
};

function midpoint(a: Keypoint, b: Keypoint): Keypoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, conf: Math.min(a.conf, b.conf) };
}

export class SitupFsm {
  private stage: SitupStage = null;
  private counter = 0;
  private score = 0;
  private leanSmoothBuffer: number[] = [];
  private trunkSmoothBuffer: number[] = [];
  private lastState: SitupFsmState = INITIAL_SITUP_STATE;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.leanSmoothBuffer = [];
    this.trunkSmoothBuffer = [];
    this.lastState = INITIAL_SITUP_STATE;
  }

  /** Feed one frame of MoveNet keypoints (flattened length-51 array). */
  update(keypoints: number[]): SitupFsmState {
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

    const shoulderMid = midpoint(shoulderL, shoulderR);
    const hipMid = midpoint(hipL, hipR);
    const kneeMid = midpoint(kneeL, kneeR);

    const leanL = spineLeanAngle(shoulderL, hipL);
    const leanR = spineLeanAngle(shoulderR, hipR);
    const rawLean = (leanL + leanR) / 2;

    this.leanSmoothBuffer.push(rawLean);
    if (this.leanSmoothBuffer.length > SMOOTH_WINDOW) this.leanSmoothBuffer.shift();
    const smoothLean =
      this.leanSmoothBuffer.reduce((sum, v) => sum + v, 0) / this.leanSmoothBuffer.length;

    const rawTrunk = calculateAngle(shoulderMid, hipMid, kneeMid);
    this.trunkSmoothBuffer.push(rawTrunk);
    if (this.trunkSmoothBuffer.length > SMOOTH_WINDOW) this.trunkSmoothBuffer.shift();
    const smoothTrunk =
      this.trunkSmoothBuffer.reduce((sum, v) => sum + v, 0) / this.trunkSmoothBuffer.length;

    const kneeAngleL = calculateAngle(hipL, kneeL, ankleL);
    const kneeAngleR = calculateAngle(hipR, kneeR, ankleR);
    const kneeBent = Math.min(kneeAngleL, kneeAngleR);
    const feetOnFloor = kneeBent > KNEE_BENT_MIN && kneeBent < KNEE_BENT_MAX;
    const classicSym = Math.abs(leanL - leanR) < CLASSIC_SYM_DIFF;

    if (smoothLean > LEAN_DOWN_ANGLE) {
      this.stage = 'DOWN';
    }
    const classicUp =
      this.stage === 'DOWN' &&
      smoothLean < LEAN_UP_ANGLE &&
      smoothTrunk < TRUNK_UP_ANGLE &&
      feetOnFloor &&
      classicSym;
    if (classicUp) {
      this.counter += 1;
      this.score += smoothLean < LEAN_PERFECT ? 10 : 5;
      this.stage = 'UP';
    }

    let feedback: string;
    if (!feetOnFloor && smoothLean < FEET_PLANTED_LEAN_MAX) {
      feedback = 'Keep feet planted';
    } else if (smoothLean > LEAN_DOWN_ANGLE) {
      feedback = 'Sit Up';
    } else if (smoothLean < LEAN_GREAT) {
      feedback = 'Great - lower with control';
    } else if (this.stage === 'UP') {
      feedback = 'Lower back down';
    } else {
      feedback = 'Keep curling up';
    }

    this.lastState = {
      stage: this.stage,
      counter: this.counter,
      score: this.score,
      feedback,
      leanAngle: smoothLean,
    };
    return this.lastState;
  }
}
