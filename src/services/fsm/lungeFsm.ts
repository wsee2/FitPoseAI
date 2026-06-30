import { calculateAngle, getKeypoint, spineLeanAngle } from '../poseMath';

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
const STANDING_ANGLE = 155;
const BOTTOM_FRONT_ANGLE = 100;
const KNEE_DIFF_THRESHOLD = 20;
const BOTH_FEET_GROUNDED_DIFF = 0.12;
const BACK_KNEE_ACTIVE_ANGLE = 150;
const LEAN_BAD = 30;
const FORM_LEAN_MAX = 20;
const LUNGE_ATTEMPT_ANGLE = 135;
const STEP_FURTHER_FRONT_ANGLE = 140;
const PERFECT_MIN = 80;
const PERFECT_MAX = 100;
const TOO_LOW_ANGLE = 80;
const SMOOTH_WINDOW = 5;
const CONF_THRESHOLD = 0.3;

export type LungeStage = 'UP' | 'DOWN' | null;

export interface LungeFsmState {
  stage: LungeStage;
  counter: number;
  score: number;
  feedback: string;
  frontKneeAngle: number | null;
}

export const INITIAL_LUNGE_STATE: LungeFsmState = {
  stage: null,
  counter: 0,
  score: 0,
  feedback: 'Get ready',
  frontKneeAngle: null,
};

export class LungeFsm {
  private stage: LungeStage = null;
  private counter = 0;
  private score = 0;
  private lungeFormGood = false;
  private smoothBuffer: number[] = [];
  private lastState: LungeFsmState = INITIAL_LUNGE_STATE;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.lungeFormGood = false;
    this.smoothBuffer = [];
    this.lastState = INITIAL_LUNGE_STATE;
  }

  /** Feed one frame of MoveNet keypoints (flattened length-51 array). */
  update(keypoints: number[]): LungeFsmState {
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
    const frontKneeRaw = Math.min(angleL, angleR);
    const backKneeRaw = Math.max(angleL, angleR);

    this.smoothBuffer.push(frontKneeRaw);
    if (this.smoothBuffer.length > SMOOTH_WINDOW) this.smoothBuffer.shift();
    const frontKnee =
      this.smoothBuffer.reduce((sum, v) => sum + v, 0) / this.smoothBuffer.length;

    const leanL = spineLeanAngle(shoulderL, hipL);
    const leanR = spineLeanAngle(shoulderR, hipR);
    const lean = (leanL + leanR) / 2;

    const kneeDiff = backKneeRaw - frontKneeRaw;
    const bothFeetGrounded = Math.abs(ankleL.y - ankleR.y) < BOTH_FEET_GROUNDED_DIFF;
    const backKneeActive = backKneeRaw < BACK_KNEE_ACTIVE_ANGLE;

    if (frontKnee > STANDING_ANGLE && backKneeRaw > STANDING_ANGLE) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.lungeFormGood ? 10 : 5;
      }
      this.stage = 'UP';
    }
    if (
      this.stage === 'UP' &&
      frontKnee < BOTTOM_FRONT_ANGLE &&
      kneeDiff > KNEE_DIFF_THRESHOLD &&
      bothFeetGrounded &&
      backKneeActive
    ) {
      this.stage = 'DOWN';
      this.lungeFormGood = lean < FORM_LEAN_MAX;
    }

    const lungeAttempt = frontKnee < LUNGE_ATTEMPT_ANGLE;
    let feedback: string;
    if (lean > LEAN_BAD) {
      feedback = 'Keep torso upright';
    } else if (!bothFeetGrounded && lungeAttempt) {
      feedback = 'Keep both feet on the floor';
    } else if (!backKneeActive && lungeAttempt) {
      feedback = 'Bend back knee - real lunge';
    } else if (kneeDiff < KNEE_DIFF_THRESHOLD && frontKnee < STEP_FURTHER_FRONT_ANGLE) {
      feedback = 'Step further forward';
    } else if (this.stage === 'UP' || frontKnee > STEP_FURTHER_FRONT_ANGLE) {
      feedback = 'Lunge Down';
    } else if (frontKnee >= PERFECT_MIN && frontKnee <= PERFECT_MAX) {
      feedback = 'Good Lunge Depth!';
    } else if (frontKnee < TOO_LOW_ANGLE) {
      feedback = 'Too Low - rise slightly';
    } else {
      feedback = 'Keep Going Down';
    }

    this.lastState = {
      stage: this.stage,
      counter: this.counter,
      score: this.score,
      feedback,
      frontKneeAngle: frontKnee,
    };
    return this.lastState;
  }
}
