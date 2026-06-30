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
const LEFT_KNEE = 13;
const RIGHT_KNEE = 14;
const LEFT_ANKLE = 15;
const RIGHT_ANKLE = 16;

// Tested thresholds ported exactly from the Python prototype — do not retune without re-validating there.
const ELBOW_BENT_ANGLE = 135;
const SUPPORT_GAP_BENT = 0.034;
const SUPPORT_GAP_STRAIGHT = 0.018;
const LEGS_STRAIGHT_ANGLE = 138;
const BODY_STRAIGHT_ANGLE = 152;
const BODY_LEVEL_DIFF = 0.14;
const SEVERE_BODY_ANGLE = 138;
const SMOOTH_WINDOW = 5;
const CONF_THRESHOLD = 0.3;
const PLANK_GRACE = 10;

export interface PlankFsmState {
  holdSeconds: number;
  isHolding: boolean;
  feedback: string;
  bodyAngle: number | null;
}

export const INITIAL_PLANK_STATE: PlankFsmState = {
  holdSeconds: 0,
  isHolding: false,
  feedback: 'Get ready',
  bodyAngle: null,
};

function midpoint(a: Keypoint, b: Keypoint): Keypoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, conf: Math.min(a.conf, b.conf) };
}

export class PlankFsm {
  private plankHoldTime = 0;
  private plankStartTime: number | null = null;
  private plankBadFrames = 0;
  private bodySmoothBuffer: number[] = [];
  private lastState: PlankFsmState = INITIAL_PLANK_STATE;

  reset(): void {
    this.plankHoldTime = 0;
    this.plankStartTime = null;
    this.plankBadFrames = 0;
    this.bodySmoothBuffer = [];
    this.lastState = INITIAL_PLANK_STATE;
  }

  /** Feed one frame of MoveNet keypoints (flattened length-51 array). */
  update(keypoints: number[]): PlankFsmState {
    const shoulderL = getKeypoint(keypoints, LEFT_SHOULDER);
    const shoulderR = getKeypoint(keypoints, RIGHT_SHOULDER);
    const elbowL = getKeypoint(keypoints, LEFT_ELBOW);
    const elbowR = getKeypoint(keypoints, RIGHT_ELBOW);
    const wristL = getKeypoint(keypoints, LEFT_WRIST);
    const wristR = getKeypoint(keypoints, RIGHT_WRIST);
    const hipL = getKeypoint(keypoints, LEFT_HIP);
    const hipR = getKeypoint(keypoints, RIGHT_HIP);
    const kneeL = getKeypoint(keypoints, LEFT_KNEE);
    const kneeR = getKeypoint(keypoints, RIGHT_KNEE);
    const ankleL = getKeypoint(keypoints, LEFT_ANKLE);
    const ankleR = getKeypoint(keypoints, RIGHT_ANKLE);

    const required = [
      shoulderL, shoulderR, elbowL, elbowR, wristL, wristR,
      hipL, hipR, kneeL, kneeR, ankleL, ankleR,
    ];
    if (required.some((p) => p.conf < CONF_THRESHOLD)) {
      // Low-confidence frame (e.g. body partially out of view) — don't miscount, just hold.
      return this.lastState;
    }

    const shoulderMid = midpoint(shoulderL, shoulderR);
    const hipMid = midpoint(hipL, hipR);
    const ankleMid = midpoint(ankleL, ankleR);

    const rawBodyAngle = calculateAngle(shoulderMid, hipMid, ankleMid);
    this.bodySmoothBuffer.push(rawBodyAngle);
    if (this.bodySmoothBuffer.length > SMOOTH_WINDOW) this.bodySmoothBuffer.shift();
    const bodyAngle =
      this.bodySmoothBuffer.reduce((sum, v) => sum + v, 0) / this.bodySmoothBuffer.length;

    const hDiff = Math.abs(shoulderMid.y - hipMid.y);
    const elbowMidY = (elbowL.y + elbowR.y) / 2;
    const wristMidY = (wristL.y + wristR.y) / 2;
    const supportY = Math.max(elbowMidY, wristMidY);
    const shoulderSupportGap = supportY - shoulderMid.y;

    const elbowAvg =
      (calculateAngle(shoulderL, elbowL, wristL) + calculateAngle(shoulderR, elbowR, wristR)) / 2;
    const torsoElevated =
      elbowAvg < ELBOW_BENT_ANGLE
        ? shoulderSupportGap > SUPPORT_GAP_BENT
        : shoulderSupportGap > SUPPORT_GAP_STRAIGHT;

    const legAngle = Math.min(
      calculateAngle(hipL, kneeL, ankleL),
      calculateAngle(hipR, kneeR, ankleR)
    );
    const legsStraight = legAngle > LEGS_STRAIGHT_ANGLE;

    const bodyStraight = bodyAngle > BODY_STRAIGHT_ANGLE;
    const bodyLevel = hDiff < BODY_LEVEL_DIFF;
    const goodPlank = bodyStraight && bodyLevel && torsoElevated && legsStraight;
    const severeBad =
      !torsoElevated || !legsStraight || bodyAngle < SEVERE_BODY_ANGLE || !bodyLevel;

    const now = Date.now() / 1000;
    let totalHold: number;
    if (goodPlank) {
      this.plankBadFrames = 0;
      if (this.plankStartTime === null) this.plankStartTime = now;
      totalHold = this.plankHoldTime + (now - this.plankStartTime);
    } else {
      if (severeBad) {
        this.plankBadFrames = PLANK_GRACE;
      } else {
        this.plankBadFrames += 1;
      }
      if (this.plankBadFrames >= PLANK_GRACE) {
        if (this.plankStartTime !== null) {
          this.plankHoldTime += now - this.plankStartTime;
          this.plankStartTime = null;
        }
        totalHold = this.plankHoldTime;
      } else {
        totalHold = this.plankHoldTime + (this.plankStartTime !== null ? now - this.plankStartTime : 0);
      }
    }

    let feedback: string;
    if (goodPlank) {
      feedback = 'Hold the plank';
    } else if (severeBad) {
      if (!torsoElevated) {
        feedback = 'Lift up - off the floor';
      } else if (!legsStraight) {
        feedback = 'Straighten legs';
      } else if (!bodyLevel) {
        feedback = 'Keep body horizontal';
      } else {
        feedback = 'No sag - body straight';
      }
    } else if (!bodyLevel) {
      feedback = 'Keep body horizontal';
    } else if (!bodyStraight) {
      feedback = 'No sag - body straight';
    } else {
      feedback = 'Hold the plank';
    }

    this.lastState = {
      holdSeconds: Math.floor(totalHold),
      isHolding: this.plankStartTime !== null,
      feedback,
      bodyAngle,
    };
    return this.lastState;
  }
}
