import { calculateAngle, getKeypoint, type Keypoint } from '../poseMath';

const DEBUG_PUSHUP = true;

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

// Relaxed from Python prototype: 155→145 (UP), 90→100 (DOWN), 155→150 (body straight), 0.12→0.15 (body level).
// Real push-ups rarely achieve 155° lock-out; the stricter values meant the UP gate never fired.
const ELBOW_UP_ANGLE = 145;
const ELBOW_DOWN_ANGLE = 100;
const ELBOW_TOO_LOW_ANGLE = 60;
const BODY_STRAIGHT_ANGLE = 150;
const BODY_LEVEL_DIFF = 0.15;
const ARMS_SUPPORTING_MARGIN = 0.03;
const PERFECT_MIN = 70;
const PERFECT_MAX = 90;
const SMOOTH_WINDOW = 5;
const CONF_THRESHOLD = 0.3;

// Camera-angle-robustness signal, mirroring squatFsm.ts's HIP_DROP_DOWN — a push-up's elbow
// bend is subject to the same 2D-projection foreshortening at a camera position that views
// the bend along its own depth axis: elbowAngle barely drops even for a genuinely deep
// push-up (confirmed on-device: elbow bottomed at ~102-108°, never crossing ELBOW_DOWN_ANGLE).
// Vertical shoulder drop, as a fraction of the user's own arm length (shoulder-to-wrist,
// self-calibrating to their limb length/camera distance, tracked as the best/highest
// shoulder position seen across the whole set — never reset per rep, see squatFsm.ts for
// why), is far less sensitive to this: shoulder position is a Y-displacement, not an angle
// at the joint being measured. UNTESTED — 0.25 is a starting estimate, expect to retune
// after real testing (watch the [PUSHUP] log below).
const SHOULDER_DROP_DOWN = 0.25;

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
  // "Top" reference for SHOULDER_DROP_DOWN — see the comment above it. Tracks the best
  // (smallest/highest) shoulderY and the arm length at that same moment, across the whole
  // set; deliberately not reset per rep (squatFsm.ts found resetting per rep meant a
  // freshly-wiped reference had to re-converge from a too-short/noisy window, breaking
  // every rep after the first one or two).
  private topShoulderY: number | null = null;
  private topArmLength: number | null = null;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.pushupFormGood = false;
    this.elbowSmoothBuffer = [];
    this.bodySmoothBuffer = [];
    this.topShoulderY = null;
    this.topArmLength = null;
    this.lastState = INITIAL_PUSHUP_STATE;
  }

  /** Clears transient per-frame state (stage, smoothing buffers) but keeps counter/score. */
  pauseForChat(): void {
    this.stage = null;
    this.pushupFormGood = false;
    this.elbowSmoothBuffer = [];
    this.bodySmoothBuffer = [];
    this.topShoulderY = null;
    this.topArmLength = null;
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
    const wristMid = midpoint(wristL, wristR);
    const elbowMidY = (elbowL.y + elbowR.y) / 2;
    const wristMidY = wristMid.y;

    const rawBodyAngle = calculateAngle(shoulderMid, hipMid, ankleMid);
    this.bodySmoothBuffer.push(rawBodyAngle);
    if (this.bodySmoothBuffer.length > SMOOTH_WINDOW) this.bodySmoothBuffer.shift();
    const bodyAngle =
      this.bodySmoothBuffer.reduce((sum, v) => sum + v, 0) / this.bodySmoothBuffer.length;

    const hDiff = Math.abs(shoulderMid.y - hipMid.y);
    const bodyStraight = bodyAngle > BODY_STRAIGHT_ANGLE;
    const bodyLevel = hDiff < BODY_LEVEL_DIFF;
    const armsSupporting = elbowMidY < wristMidY - ARMS_SUPPORTING_MARGIN;

    // Shoulder-drop fraction against the "top" (elbows-locked) reference — see
    // SHOULDER_DROP_DOWN above. Computed BEFORE this frame's reference refresh below, so a
    // rep-starting frame is measured against where the top actually was, not against itself.
    const armLength = Math.max(Math.hypot(wristMid.x - shoulderMid.x, wristMid.y - shoulderMid.y), 1e-6);
    const shoulderDropFrac =
      this.topShoulderY != null && this.topArmLength != null
        ? (shoulderMid.y - this.topShoulderY) / this.topArmLength
        : 0;

    // angleTrigger keeps the ORIGINAL behavior unchanged. dropTrigger deliberately does NOT
    // gate on bodyStraight: it's an angle derived from the same potentially-distorted
    // camera position (confirmed distorted for plankFsm.ts at this exact placement), so it
    // could fail the same way the elbow angle does (see squatFsm.ts's kneeSym reasoning —
    // identical logic applies here). bodyLevel stays a shared gate — it's a position check,
    // not an angle, so it's not camera-angle-fragile.
    const angleTrigger = elbowAngle < ELBOW_DOWN_ANGLE && bodyStraight;
    const dropTrigger = shoulderDropFrac > SHOULDER_DROP_DOWN;
    // Camera-angle-robust "reached proper depth" signal, reused below for feedback/status
    // display only (NOT for pushupFormGood/score — that was already body-alignment-only,
    // not depth-based, so no parity gap there) — mirrors squatFsm.ts's goodDepth for the
    // same reason (a rep could count via dropTrigger yet still display as shallow if only
    // the raw elbow range were checked here).
    const goodDepth = (elbowAngle >= PERFECT_MIN && elbowAngle <= PERFECT_MAX) || dropTrigger;

    if (DEBUG_PUSHUP) {
      console.log(
        `[PUSHUP] stage=${this.stage ?? 'null'} counter=${this.counter} ` +
        `elbow=${elbowAngle.toFixed(1)}° body=${bodyAngle.toFixed(1)}° ` +
        `hDiff=${hDiff.toFixed(3)} arms=${armsSupporting} level=${bodyLevel} straight=${bodyStraight} ` +
        `shoulderY=${shoulderMid.y.toFixed(3)} topShoulderY=${this.topShoulderY?.toFixed(3) ?? 'null'} ` +
        `armLen=${armLength.toFixed(3)} topArmLen=${this.topArmLength?.toFixed(3) ?? 'null'} ` +
        `dropFrac=${shoulderDropFrac.toFixed(3)}(>${SHOULDER_DROP_DOWN}) ` +
        `angleTrigger=${angleTrigger} dropTrigger=${dropTrigger}`
      );
    }

    const genuinelyUp = elbowAngle > ELBOW_UP_ANGLE && bodyLevel && armsSupporting;
    if (genuinelyUp) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.pushupFormGood ? 10 : 5;
      }
      this.stage = 'UP';
    } else if (this.stage === 'UP' && (angleTrigger || dropTrigger) && bodyLevel) {
      this.stage = 'DOWN';
      this.pushupFormGood = bodyStraight;
    }

    // Track the BEST (smallest/highest) shoulderY seen across the whole set — deliberately
    // not reset per rep. See squatFsm.ts for the full reasoning.
    if (genuinelyUp && (this.topShoulderY == null || shoulderMid.y < this.topShoulderY)) {
      this.topShoulderY = shoulderMid.y;
      this.topArmLength = armLength;
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
    } else if (goodDepth) {
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
    } else if (goodDepth) {
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
