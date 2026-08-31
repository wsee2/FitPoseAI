import { calculateAngle, getKeypoint, spineLeanAngle } from '../poseMath';
import { DEBUG_LOGS as DEBUG_SQUAT, shouldLogFsmFrame } from '../../utils/debugFlags';

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

// Camera-angle-robustness signal for the DOWN transition, alongside the angle check above.
// The knee angle is a 2D projection of the true 3D joint angle — how much it changes per
// degree of real knee bend depends heavily on camera viewing angle. A camera placed low and
// tilted up (closer to the original Python-prototype test setup) sees more apparent angle
// change per unit of real squat depth than one at eye/table height facing the user more
// frontally, where the bend happens more along the camera's depth axis (foreshortened) — so
// the 2D angle barely drops until the user is almost all the way down.
// Hip vertical drop, measured as a fraction of the user's OWN standing leg length (hip-to-
// ankle, re-captured every time they're standing so it self-calibrates to their distance/
// height/camera zoom), is far less sensitive to this: a real downward hip movement projects
// to roughly proportional downward image-space movement across a much wider range of camera
// placements. This is a starting estimate (~a 90-degree-ish bend) — retune empirically like
// the angle thresholds above, ideally testing at both a low and an eye-level camera position.
const HIP_DROP_DOWN = 0.35;

export type SquatStage = 'UP' | 'DOWN' | null;

export interface SquatFsmState {
  stage: SquatStage;
  counter: number;
  score: number;
  feedback: string;
  kneeAngle: number | null;
  status: 'good' | 'adjust' | 'error' | 'guide';
}

export const INITIAL_SQUAT_STATE: SquatFsmState = {
  stage: null,
  counter: 0,
  score: 0,
  feedback: 'Get ready',
  kneeAngle: null,
  status: 'guide',
};

export class SquatFsm {
  private stage: SquatStage = null;
  private counter = 0;
  private score = 0;
  private squatFormGood = false;
  private smoothBuffer: number[] = [];
  private lastState: SquatFsmState = INITIAL_SQUAT_STATE;
  // Standing reference for HIP_DROP_DOWN, re-captured every frame the user is 'UP' — see the
  // comment above HIP_DROP_DOWN.
  private standingHipY: number | null = null;
  private standingLegLength: number | null = null;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.squatFormGood = false;
    this.smoothBuffer = [];
    this.standingHipY = null;
    this.standingLegLength = null;
    this.lastState = INITIAL_SQUAT_STATE;
  }

  /** Clears transient per-frame state (stage, smoothing buffer) but keeps counter/score. */
  pauseForChat(): void {
    this.stage = null;
    this.squatFormGood = false;
    this.smoothBuffer = [];
    this.standingHipY = null;
    this.standingLegLength = null;
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

    // Hip-drop fraction against the standing reference captured on prior 'UP' frames (see
    // HIP_DROP_DOWN above) — computed BEFORE this frame's reference refresh below, so a
    // rep-starting frame is measured against where standing actually was, not against itself.
    const hipY = (hipL.y + hipR.y) / 2;
    const ankleY = (ankleL.y + ankleR.y) / 2;
    const hipDropFrac =
      this.standingHipY != null && this.standingLegLength != null
        ? (hipY - this.standingHipY) / this.standingLegLength
        : 0;

    if (angle > STANDING_ANGLE) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.squatFormGood ? 10 : 5;
        // Deliberately NOT resetting standingHipY/standingLegLength here. An earlier version
        // did, so each rep had to re-converge on a true standing reference from scratch — but
        // that only gets to observe frames while angle > STANDING_ANGLE, and with
        // SMOOTH_WINDOW adding lag to the angle signal, that window can be too short/noisy at
        // a normal workout tempo (no long pause at the top) to converge before the next
        // descent starts. Confirmed: only the first 1-2 reps (which had a long, well-
        // converged reference from before any squatting began) counted; every rep after that,
        // working from a freshly-wiped reference, silently failed the same way the very first
        // bug did. The min-tracking below only ever moves toward a BETTER (more standing)
        // value, never a worse one, so there's no downside to letting it persist and keep
        // refining across the whole set instead of restarting per rep.
      }
      this.stage = 'UP';
    }

    // angleTrigger keeps the ORIGINAL Python-prototype-validated behavior unchanged: knee
    // angle crossing BOTTOM_ANGLE, gated by kneeSym (L/R knee-angle symmetry) as a stability
    // check. hipTrigger deliberately does NOT gate on kneeSym: kneeSym is itself a 2D-
    // projected-angle metric, and at a camera angle where the pure knee-angle trigger already
    // fails (see HIP_DROP_DOWN comment above), small real L/R asymmetries get exaggerated the
    // same way — confirmed empirically (kneeSym reached 50+ degrees during a genuine, controlled
    // squat at an eye-level camera). Applying it to the hip-drop path would defeat the point of
    // adding a camera-angle-robust signal. footDiff (ankle L/R level-ness) stays a shared gate
    // for both — it held reliably low throughout the same test, so it's not camera-angle-fragile.
    const angleTrigger = angle < BOTTOM_ANGLE && kneeSym < KNEE_SYM_DOWN;
    const hipTrigger = hipDropFrac > HIP_DROP_DOWN;
    // Camera-angle-robust "reached proper squat depth" signal — reused below for score,
    // feedback text, and skeleton status, not just this trigger. Without this, a squat could
    // correctly COUNT via hipTrigger yet still score/display as "not perfect", purely because
    // `angle` (the same camera-angle-distorted 2D projection) never entered
    // [PERFECT_MIN, PERFECT_MAX] at the exact moment the rep was confirmed — even though the
    // skeleton might flash green a few frames later as the user kept descending, by which
    // point squatFormGood had already been locked in as false for that rep. Confirmed
    // empirically: normal-depth squats scored 5/10 ("not perfect") despite counting correctly,
    // and only very deep squats (where the distorted angle eventually wandered into range by
    // coincidence) flashed green — also still scoring only 5, since that happened after the
    // trigger had already fired and locked the score.
    const goodDepth = (angle >= PERFECT_MIN && angle <= PERFECT_MAX) || hipDropFrac > HIP_DROP_DOWN;
    if (this.stage === 'UP' && (angleTrigger || hipTrigger) && footDiff < FOOT_DIFF_DOWN) {
      this.stage = 'DOWN';
      this.squatFormGood = goodDepth && lean < LEAN_BAD;
    }

    // Track the BEST (smallest/most-standing) hipY seen across the whole set (see the note
    // above — deliberately not reset per rep), instead of overwriting the reference with
    // whatever the latest angle > STANDING_ANGLE frame happens to show. Confirmed via a
    // second [SQUAT] log round: a single frame during a fast
    // bounce between reps briefly smoothed-angle-crossed STANDING_ANGLE without the user
    // actually being fully upright (standingHipY got set to 0.658, when true standing was
    // consistently ~0.54-0.56 elsewhere in the same log) — that alone was enough to keep
    // hipDropFrac from ever crossing HIP_DROP_DOWN, even on a clean, deep, symmetric squat.
    // Only updating when a frame is BETTER than what's already recorded makes the reference
    // converge to, and stay at, the true standing position and ignore worse transient readings.
    if (angle > STANDING_ANGLE && (this.standingHipY == null || hipY < this.standingHipY)) {
      this.standingHipY = hipY;
      this.standingLegLength = Math.max(ankleY - hipY, 1e-6);
    }

    if (DEBUG_SQUAT && shouldLogFsmFrame()) {
      console.log(
        `[SQUAT] stage=${this.stage} angle=${angle.toFixed(1)}° (L=${angleL.toFixed(1)} R=${angleR.toFixed(1)}) ` +
        `hipY=${hipY.toFixed(3)} ankleY=${ankleY.toFixed(3)} standingHipY=${this.standingHipY?.toFixed(3) ?? 'null'} ` +
        `standingLegLen=${this.standingLegLength?.toFixed(3) ?? 'null'} hipDropFrac=${hipDropFrac.toFixed(3)} ` +
        `footDiff=${footDiff.toFixed(3)}(<${FOOT_DIFF_DOWN}) kneeSym=${kneeSym.toFixed(1)}(<${KNEE_SYM_DOWN}) ` +
        `angleTrigger=${angleTrigger} hipTrigger=${hipTrigger}`
      );
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
    } else if (goodDepth) {
      feedback = 'Perfect Squat Depth';
    } else {
      feedback = 'Keep Going Down';
    }

    let status: 'good' | 'adjust' | 'error' | 'guide';
    if (this.stage === null) {
      status = 'guide';
    } else if (footDiff > FOOT_DIFF_BAD || excessiveLean || (kneeSym > KNEE_SYM_BAD && angle < 155) || angle < TOO_LOW_ANGLE) {
      status = 'error';
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
      kneeAngle: angle,
      status,
    };
    return this.lastState;
  }
}
