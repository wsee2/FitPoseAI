import { calculateAngle, getKeypoint, type Keypoint } from '../poseMath';

// MoveNet (COCO-17) keypoint indices used by this FSM.
const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER = 6;
const LEFT_ELBOW = 7;
const RIGHT_ELBOW = 8;
const LEFT_WRIST = 9;
const RIGHT_WRIST = 10;
const LEFT_HIP = 11;
const RIGHT_HIP = 12;
const LEFT_ANKLE = 15;
const RIGHT_ANKLE = 16;

// Tested thresholds ported exactly from the Python prototype — do not retune without re-validating there.
const ELBOW_UP_ANGLE = 155;
const ELBOW_DOWN_ANGLE = 90;
const ELBOW_TOO_LOW_ANGLE = 60;
const BODY_STRAIGHT_ANGLE = 155;
const BODY_LEVEL_DIFF = 0.12;
const ARMS_SUPPORTING_MARGIN = 0.03;
const PERFECT_MIN = 70;
const PERFECT_MAX = 90;
const SMOOTH_WINDOW = 5;
const CONF_THRESHOLD = 0.3;

export type PushupStage = 'UP' | 'DOWN' | null;

export interface PushupFsmState {
  stage: PushupStage;
  counter: number;
  score: number;
  feedback: string;
  elbowAngle: number | null;
  status: 'good' | 'adjust' | 'error' | 'guide';
}

export const INITIAL_PUSHUP_STATE: PushupFsmState = {
  stage: null,
  counter: 0,
  score: 0,
  feedback: 'Get ready',
  elbowAngle: null,
  status: 'guide',
};

function midpoint(a: Keypoint, b: Keypoint): Keypoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, conf: Math.min(a.conf, b.conf) };
}

export class PushupFsm {
  private stage: PushupStage = null;
  private counter = 0;
  private score = 0;
  private pushupFormGood = false;
  private elbowSmoothBuffer: number[] = [];
  private bodySmoothBuffer: number[] = [];
  private lastState: PushupFsmState = INITIAL_PUSHUP_STATE;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.pushupFormGood = false;
    this.elbowSmoothBuffer = [];
    this.bodySmoothBuffer = [];
    this.lastState = INITIAL_PUSHUP_STATE;
  }

  /** Feed one frame of MoveNet keypoints (flattened length-51 array). */
  update(keypoints: number[]): PushupFsmState {
    const shoulderL = getKeypoint(keypoints, LEFT_SHOULDER);
    const shoulderR = getKeypoint(keypoints, RIGHT_SHOULDER);
    const elbowL = getKeypoint(keypoints, LEFT_ELBOW);
    const elbowR = getKeypoint(keypoints, RIGHT_ELBOW);
    const wristL = getKeypoint(keypoints, LEFT_WRIST);
    const wristR = getKeypoint(keypoints, RIGHT_WRIST);
    const hipL = getKeypoint(keypoints, LEFT_HIP);
    const hipR = getKeypoint(keypoints, RIGHT_HIP);
    const ankleL = getKeypoint(keypoints, LEFT_ANKLE);
    const ankleR = getKeypoint(keypoints, RIGHT_ANKLE);

    const required = [
      shoulderL, shoulderR, elbowL, elbowR, wristL, wristR, hipL, hipR, ankleL, ankleR,
    ];
    if (required.some((p) => p.conf < CONF_THRESHOLD)) {
      // Low-confidence frame (e.g. body partially out of view) — don't miscount, just hold.
      return this.lastState;
    }

    const elbowAngleL = calculateAngle(shoulderL, elbowL, wristL);
    const elbowAngleR = calculateAngle(shoulderR, elbowR, wristR);
    const rawElbowAngle = (elbowAngleL + elbowAngleR) / 2;

    this.elbowSmoothBuffer.push(rawElbowAngle);
    if (this.elbowSmoothBuffer.length > SMOOTH_WINDOW) this.elbowSmoothBuffer.shift();
    const elbowAngle =
      this.elbowSmoothBuffer.reduce((sum, v) => sum + v, 0) / this.elbowSmoothBuffer.length;

    const shoulderMid = midpoint(shoulderL, shoulderR);
    const hipMid = midpoint(hipL, hipR);
    const ankleMid = midpoint(ankleL, ankleR);
    const elbowMidY = (elbowL.y + elbowR.y) / 2;
    const wristMidY = (wristL.y + wristR.y) / 2;

    const rawBodyAngle = calculateAngle(shoulderMid, hipMid, ankleMid);
    this.bodySmoothBuffer.push(rawBodyAngle);
    if (this.bodySmoothBuffer.length > SMOOTH_WINDOW) this.bodySmoothBuffer.shift();
    const bodyAngle =
      this.bodySmoothBuffer.reduce((sum, v) => sum + v, 0) / this.bodySmoothBuffer.length;

    const hDiff = Math.abs(shoulderMid.y - hipMid.y);
    const bodyStraight = bodyAngle > BODY_STRAIGHT_ANGLE;
    const bodyLevel = hDiff < BODY_LEVEL_DIFF;
    const armsSupporting = elbowMidY < wristMidY - ARMS_SUPPORTING_MARGIN;

    if (elbowAngle > ELBOW_UP_ANGLE && bodyLevel && armsSupporting) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.pushupFormGood ? 10 : 5;
      }
      this.stage = 'UP';
    } else if (
      this.stage === 'UP' &&
      elbowAngle < ELBOW_DOWN_ANGLE &&
      bodyStraight &&
      bodyLevel
    ) {
      this.stage = 'DOWN';
      this.pushupFormGood = bodyStraight;
    }

    let feedback: string;
    if (!bodyLevel) {
      feedback = 'Keep body horizontal';
    } else if (!bodyStraight) {
      feedback = 'No sag - body straight';
    } else if (!armsSupporting && this.stage !== 'DOWN') {
      feedback = 'Get into push-up position';
    } else if (elbowAngle > ELBOW_UP_ANGLE) {
      feedback = 'Go Down';
    } else if (elbowAngle < ELBOW_TOO_LOW_ANGLE) {
      feedback = 'Too Low - rise slightly';
    } else if (this.stage === 'DOWN' && elbowAngle >= ELBOW_TOO_LOW_ANGLE && elbowAngle <= ELBOW_DOWN_ANGLE) {
      feedback = 'Push Up!';
    } else if (elbowAngle >= PERFECT_MIN && elbowAngle <= PERFECT_MAX) {
      feedback = 'Good Depth - Push Up!';
    } else {
      feedback = 'Keep Going Down';
    }

    let status: 'good' | 'adjust' | 'error' | 'guide';
    if (this.stage === null) {
      status = 'guide';
    } else if (!bodyLevel || !bodyStraight || elbowAngle < ELBOW_TOO_LOW_ANGLE) {
      status = 'error';
    } else if (!armsSupporting && this.stage !== 'DOWN') {
      status = 'guide';
    } else if (elbowAngle >= PERFECT_MIN && elbowAngle <= PERFECT_MAX) {
      status = 'good';
    } else {
      status = 'adjust';
    }

    this.lastState = {
      stage: this.stage,
      counter: this.counter,
      score: this.score,
      feedback,
      elbowAngle,
      status,
    };
    return this.lastState;
  }
}
