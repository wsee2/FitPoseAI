import { calculateAngle, getKeypoint, spineLeanAngle } from '../poseMath';
import { DEBUG_LOGS as DEBUG_LUNGE, shouldLogFsmFrame } from '../../utils/debugFlags';

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

// Camera-angle-robustness signal, mirroring squatFsm.ts's HIP_DROP_DOWN — a lunge is
// mechanically a single-leg squat (the hip drops vertically the same way as the front knee
// bends), so it's subject to the identical 2D-projection foreshortening at a more frontal/
// eye-level camera angle: frontKnee barely drops even for a genuine deep lunge. Hip vertical
// drop, as a fraction of the user's own standing leg length (hip-to-ankle, self-calibrating
// to their distance/camera zoom, tracked as the best/most-standing value seen across the
// whole set — never reset per rep, see squatFsm.ts for why), is far less sensitive to this.
// Reusing squat's validated 0.35 as a starting point since the underlying geometry (hip drop
// for a ~90-degree-ish leg bend) is comparable — retune empirically if needed.
const HIP_DROP_DOWN = 0.35;

// Second-tier fallback for when the camera framing doesn't include the ankles at all — see
// squatFsm.ts's THIGH_DROP_DOWN for the full on-device evidence and reasoning (confirmed
// there: ankle confidence can sit at 0.01-0.09 for an entire session, with ankle Y at/beyond
// the frame's bottom edge, while knee confidence stays far more reliable). Same idea here:
// hip-to-KNEE distance (thigh length) instead of hip-to-ankle (full leg length) as the
// self-calibrating denominator. Reusing squat's untested starting estimates as-is, same way
// HIP_DROP_DOWN above already reuses squat's validated value — retune on-device if needed.
const THIGH_DROP_DOWN = 0.6;
const THIGH_STANDING_MAX = 0.15;

export type LungeStage = 'UP' | 'DOWN' | null;

export interface LungeFsmState {
  stage: LungeStage;
  counter: number;
  score: number;
  feedback: string;
  frontKneeAngle: number | null;
  status: 'good' | 'adjust' | 'error' | 'guide';
}

export const INITIAL_LUNGE_STATE: LungeFsmState = {
  stage: null,
  counter: 0,
  score: 0,
  feedback: 'Get ready',
  frontKneeAngle: null,
  status: 'guide',
};

export class LungeFsm {
  private stage: LungeStage = null;
  private counter = 0;
  private score = 0;
  private lungeFormGood = false;
  private smoothBuffer: number[] = [];
  private lastState: LungeFsmState = INITIAL_LUNGE_STATE;
  // Standing reference for HIP_DROP_DOWN — see squatFsm.ts for the full reasoning. Tracks the
  // best (smallest/most-standing) hipY seen across the whole set; deliberately not reset per
  // rep (squatFsm.ts found that resetting per rep meant a freshly-wiped reference had to
  // re-converge from a too-short/noisy window, breaking every rep after the first one or two).
  private standingHipY: number | null = null;
  private standingLegLength: number | null = null;
  // Standing reference for THIGH_DROP_DOWN — captured at the same moments as the two above.
  private standingThighLength: number | null = null;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.lungeFormGood = false;
    this.smoothBuffer = [];
    this.standingHipY = null;
    this.standingLegLength = null;
    this.standingThighLength = null;
    this.lastState = INITIAL_LUNGE_STATE;
  }

  /** Clears transient per-frame state (stage, smoothing buffer) but keeps counter/score. */
  pauseForChat(): void {
    this.stage = null;
    this.lungeFormGood = false;
    this.smoothBuffer = [];
    this.standingHipY = null;
    this.standingLegLength = null;
    this.standingThighLength = null;
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

    // Ankle NOT required — see squatFsm.ts's identical change for the full on-device
    // evidence. ankleTrusted (below) gates every specific use of ankle data (front/back knee
    // classification, kneeDiff, backKneeActive, bothFeetGrounded) so an untrusted ankle can't
    // corrupt those signals; thighDropFrac/THIGH_DROP_DOWN covers depth detection instead.
    const required = [shoulderL, shoulderR, hipL, hipR, kneeL, kneeR];
    if (required.some((p) => p.conf < CONF_THRESHOLD)) {
      // Low-confidence frame (e.g. body partially out of view) — don't miscount, just hold.
      if (DEBUG_LUNGE && shouldLogFsmFrame()) {
        console.log(
          `[LUNGE] LOW-CONFIDENCE FRAME, pausing — ` +
          `shoulderL=${shoulderL.conf.toFixed(2)} shoulderR=${shoulderR.conf.toFixed(2)} ` +
          `hipL=${hipL.conf.toFixed(2)} hipR=${hipR.conf.toFixed(2)} ` +
          `kneeL=${kneeL.conf.toFixed(2)} kneeR=${kneeR.conf.toFixed(2)} ` +
          `ankleL=${ankleL.conf.toFixed(2)} ankleR=${ankleR.conf.toFixed(2)}`
        );
      }
      return this.lastState;
    }
    const ankleTrusted = ankleL.conf >= CONF_THRESHOLD && ankleR.conf >= CONF_THRESHOLD;

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

    // kneeDiff/bothFeetGrounded/backKneeActive are all ankle/angle-derived — only meaningful
    // when ankleTrusted (below).
    const kneeDiff = backKneeRaw - frontKneeRaw;
    const bothFeetGrounded = Math.abs(ankleL.y - ankleR.y) < BOTH_FEET_GROUNDED_DIFF;
    const backKneeActive = backKneeRaw < BACK_KNEE_ACTIVE_ANGLE;

    // Hip-drop fractions against the standing references — see HIP_DROP_DOWN/THIGH_DROP_DOWN
    // above. Computed BEFORE this frame's reference refresh below, so a rep-starting frame is
    // measured against where standing actually was, not against itself.
    const hipY = (hipL.y + hipR.y) / 2;
    const kneeY = (kneeL.y + kneeR.y) / 2;
    const ankleY = (ankleL.y + ankleR.y) / 2;
    const hipDropFrac =
      this.standingHipY != null && this.standingLegLength != null
        ? (hipY - this.standingHipY) / this.standingLegLength
        : 0;
    const thighDropFrac =
      this.standingHipY != null && this.standingThighLength != null
        ? (hipY - this.standingHipY) / this.standingThighLength
        : 0;

    // Angle-based when ankle is trusted (original, unchanged behavior — both legs need to
    // read straight to count as standing). Falls back to thighDropFrac otherwise, same
    // cold-start bootstrap as squatFsm.ts (defaults to standing before any reference exists).
    const genuinelyStanding = ankleTrusted
      ? frontKnee > STANDING_ANGLE && backKneeRaw > STANDING_ANGLE
      : this.standingHipY == null || thighDropFrac < THIGH_STANDING_MAX;
    if (genuinelyStanding) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.lungeFormGood ? 10 : 5;
      }
      this.stage = 'UP';
    }

    // angleTrigger keeps the ORIGINAL Python-prototype-validated behavior unchanged, but only
    // when ankleTrusted — an untrusted ankle makes front/back knee classification itself
    // unreliable, not just imprecise (see squatFsm.ts's identical reasoning).
    // hipTrigger deliberately does NOT gate on kneeDiff/backKneeActive: both are derived from
    // the same 2D-projected knee angles that are unreliable at the camera angle where the
    // angle trigger already fails (see squatFsm.ts's kneeSym reasoning — identical logic
    // applies here). bothFeetGrounded stays a shared gate for both when ankleTrusted — it's a
    // position check, not an angle, so it's not camera-angle-fragile, just
    // ankle-visibility-fragile like everything else ankle-derived here.
    const angleTrigger =
      ankleTrusted && frontKnee < BOTTOM_FRONT_ANGLE && kneeDiff > KNEE_DIFF_THRESHOLD && backKneeActive;
    const hipTrigger = ankleTrusted && hipDropFrac > HIP_DROP_DOWN;
    // Ankle-independent depth trigger — see THIGH_DROP_DOWN above.
    const thighTrigger = thighDropFrac > THIGH_DROP_DOWN;
    // Camera-angle-robust "reached proper lunge depth" signal, reused below for score,
    // feedback, and status — mirrors squatFsm.ts's goodDepth for the same reason (a rep could
    // count via hipTrigger yet still score/display as shallow if only the raw angle range were
    // checked here).
    const goodDepth =
      (ankleTrusted && frontKnee >= PERFECT_MIN && frontKnee <= PERFECT_MAX) ||
      hipTrigger ||
      thighDropFrac > THIGH_DROP_DOWN;
    // bothFeetGrounded only gates when ankleTrusted — see squatFsm.ts's identical footDiff
    // treatment.
    if (this.stage === 'UP' && (angleTrigger || hipTrigger || thighTrigger) && (!ankleTrusted || bothFeetGrounded)) {
      this.stage = 'DOWN';
      this.lungeFormGood = goodDepth && lean < FORM_LEAN_MAX;
    }

    // Track the BEST (smallest/most-standing) hipY seen across the whole set — deliberately
    // not reset per rep. See squatFsm.ts for the full reasoning (both the "why min-tracking
    // instead of overwrite" and "why not reset per rep" bugs were found and fixed there first).
    // Gated on genuinelyStanding (not the raw angle check) so this still converges via the
    // thigh-based path when ankle isn't trusted — see squatFsm.ts's identical change.
    if (genuinelyStanding && (this.standingHipY == null || hipY < this.standingHipY)) {
      this.standingHipY = hipY;
      this.standingLegLength = Math.max(ankleY - hipY, 1e-6);
      this.standingThighLength = Math.max(kneeY - hipY, 1e-6);
    }

    if (DEBUG_LUNGE && shouldLogFsmFrame()) {
      console.log(
        `[LUNGE] stage=${this.stage} front=${frontKnee.toFixed(1)}° back=${backKneeRaw.toFixed(1)}° ankleTrusted=${ankleTrusted} ` +
        `hipY=${hipY.toFixed(3)} kneeY=${kneeY.toFixed(3)} standingHipY=${this.standingHipY?.toFixed(3) ?? 'null'} ` +
        `standingLegLen=${this.standingLegLength?.toFixed(3) ?? 'null'} standingThighLen=${this.standingThighLength?.toFixed(3) ?? 'null'} ` +
        `hipDropFrac=${hipDropFrac.toFixed(3)} thighDropFrac=${thighDropFrac.toFixed(3)}(>${THIGH_DROP_DOWN}) ` +
        `kneeDiff=${kneeDiff.toFixed(1)}(>${KNEE_DIFF_THRESHOLD}) grounded=${bothFeetGrounded} backActive=${backKneeActive} ` +
        `angleTrigger=${angleTrigger} hipTrigger=${hipTrigger} thighTrigger=${thighTrigger}`
      );
    }

    // lungeAttempt and everything below gated on it are ankle-dependent (frontKnee itself
    // needs ankle) — only trusted when ankleTrusted, same as squatFsm.ts's equivalent gates.
    // Without ankleTrusted, feedback/status fall back to the simpler genuinelyStanding/
    // goodDepth signals, same as squatFsm.ts — leg-specific coaching (which leg is front,
    // whether the back knee is bent enough) isn't available without a trustworthy ankle to
    // tell the legs apart in the first place.
    const lungeAttempt = ankleTrusted && frontKnee < LUNGE_ATTEMPT_ANGLE;
    let feedback: string;
    if (lean > LEAN_BAD) {
      feedback = 'Keep torso upright';
    } else if (ankleTrusted && !bothFeetGrounded && lungeAttempt) {
      feedback = 'Keep both feet on the floor';
    } else if (ankleTrusted && !backKneeActive && lungeAttempt) {
      feedback = 'Bend back knee - real lunge';
    } else if (ankleTrusted && kneeDiff < KNEE_DIFF_THRESHOLD && frontKnee < STEP_FURTHER_FRONT_ANGLE) {
      feedback = 'Step further forward';
    } else if (this.stage === 'UP' || (ankleTrusted && frontKnee > STEP_FURTHER_FRONT_ANGLE)) {
      feedback = 'Lunge Down';
    } else if (goodDepth) {
      feedback = 'Good Lunge Depth!';
    } else if (ankleTrusted && frontKnee < TOO_LOW_ANGLE) {
      feedback = 'Too Low - rise slightly';
    } else {
      feedback = 'Keep Going Down';
    }

    let status: 'good' | 'adjust' | 'error' | 'guide';
    if (this.stage === null) {
      status = 'guide';
    } else if (lean > LEAN_BAD || (ankleTrusted && !bothFeetGrounded && lungeAttempt) || (ankleTrusted && !backKneeActive && lungeAttempt) || (ankleTrusted && frontKnee < TOO_LOW_ANGLE)) {
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
      frontKneeAngle: frontKnee,
      status,
    };
    return this.lastState;
  }
}
