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

// Second-tier fallback for when the camera's framing/distance doesn't include the ankles at
// all — confirmed on-device: ankle confidence sitting at 0.01-0.09 for an entire session
// (not a borderline-under-threshold case like plankFsm's shoulder/hip confidence tuning —
// genuinely no signal), with [POSE] showing ankle Y at/beyond the frame's bottom edge
// (~0.95-1.03). HIP_DROP_DOWN itself still needs one trustworthy ankle reading to calibrate
// standingLegLength, so it can't help here either. Knee confidence tracked far more reliably
// in the same log (commonly 0.4-0.9), so this reuses the same self-calibrating-fraction idea
// as HIP_DROP_DOWN, but against hip-to-KNEE distance (thigh length) instead of hip-to-ankle
// (full leg length) — geometrically sound because a thigh rotates from vertical (standing)
// toward horizontal (at depth), so its vertical extent shrinks the same way full leg length
// does, just using a reference point that's actually visible when ankles aren't.
// UNTESTED — a starting estimate, not empirically validated: thigh length is typically
// roughly half of full hip-to-ankle leg length, so the same real hip drop should read as
// roughly double the HIP_DROP_DOWN fraction against the smaller thigh-length denominator.
// Retune on-device like every other threshold in this file.
const THIGH_DROP_DOWN = 0.6;
// "Still standing" counterpart for the ankle-untrusted path — mirrors STANDING_ANGLE's role
// but against thighDropFrac instead of the (ankle-dependent, unusable here) knee angle. Also
// untested; should sit comfortably below THIGH_DROP_DOWN so there's a clear dead zone between
// "standing" and "at depth", same relationship STANDING_ANGLE/BOTTOM_ANGLE already have.
const THIGH_STANDING_MAX = 0.15;

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
  // Standing reference for THIGH_DROP_DOWN — captured at the same moments as the two above.
  private standingThighLength: number | null = null;

  reset(): void {
    this.stage = null;
    this.counter = 0;
    this.score = 0;
    this.squatFormGood = false;
    this.smoothBuffer = [];
    this.standingHipY = null;
    this.standingLegLength = null;
    this.standingThighLength = null;
    this.lastState = INITIAL_SQUAT_STATE;
  }

  /** Clears transient per-frame state (stage, smoothing buffer) but keeps counter/score. */
  pauseForChat(): void {
    this.stage = null;
    this.squatFormGood = false;
    this.smoothBuffer = [];
    this.standingHipY = null;
    this.standingLegLength = null;
    this.standingThighLength = null;
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

    // Ankle NOT required — confirmed on-device (see THIGH_DROP_DOWN above) that a tight/close
    // camera framing can leave ankle confidence near-zero for an entire session, which used
    // to block this whole function every single frame and freeze the FSM's last state
    // indefinitely. Best-effort now: ankleTrusted (below) gates every specific use of ankle
    // data (the angle-based checks, footDiff) so ungated garbage ankle positions can't
    // corrupt those signals — thighDropFrac/THIGH_DROP_DOWN covers depth detection instead.
    const required = [shoulderL, shoulderR, hipL, hipR, kneeL, kneeR];
    if (required.some((p) => p.conf < CONF_THRESHOLD)) {
      // Low-confidence frame (e.g. body partially out of view) — don't miscount, just hold.
      if (DEBUG_SQUAT && shouldLogFsmFrame()) {
        console.log(
          `[SQUAT] LOW-CONFIDENCE FRAME, pausing — ` +
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
    const rawKneeAngle = (angleL + angleR) / 2;

    this.smoothBuffer.push(rawKneeAngle);
    if (this.smoothBuffer.length > SMOOTH_WINDOW) this.smoothBuffer.shift();
    const angle =
      this.smoothBuffer.reduce((sum, v) => sum + v, 0) / this.smoothBuffer.length;

    const leanL = spineLeanAngle(shoulderL, hipL);
    const leanR = spineLeanAngle(shoulderR, hipR);
    const lean = (leanL + leanR) / 2;

    // footDiff/kneeSym are ankle/angle-derived — only meaningful when ankleTrusted (below).
    const footDiff = Math.abs(ankleL.y - ankleR.y);
    const kneeSym = Math.abs(angleL - angleR);

    // Hip-drop fractions against the standing references captured on prior 'UP' frames (see
    // HIP_DROP_DOWN/THIGH_DROP_DOWN above) — computed BEFORE this frame's reference refresh
    // below, so a rep-starting frame is measured against where standing actually was, not
    // against itself.
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

    // "Genuinely standing" — angle-based when ankle is trusted (original, unchanged
    // behavior). When it isn't, falls back to thighDropFrac; before any thigh reference
    // exists yet (this.standingHipY == null), defaults to true so the very first frame can
    // bootstrap a reference at all — same cold-start assumption the angle path implicitly
    // makes (it also has no better information before its first confident reading).
    const genuinelyStanding = ankleTrusted
      ? angle > STANDING_ANGLE
      : this.standingHipY == null || thighDropFrac < THIGH_STANDING_MAX;

    if (genuinelyStanding) {
      if (this.stage === 'DOWN') {
        this.counter += 1;
        this.score += this.squatFormGood ? 10 : 5;
        // Deliberately NOT resetting standing*/legLength/thighLength here. An earlier version
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

    // angleTrigger/hipTrigger keep the ORIGINAL Python-prototype-validated behavior
    // unchanged, but only when ankleTrusted — an untrusted ankle's position is essentially
    // noise (confirmed on-device: 0.01-0.09 confidence for a whole session), so letting it
    // feed the knee angle or hipDropFrac's leg-length reference would produce meaningless
    // values rather than just "no signal". angleTrigger is gated by kneeSym (L/R knee-angle
    // symmetry) as a stability check. hipTrigger deliberately does NOT gate on kneeSym:
    // kneeSym is itself a 2D-projected-angle metric, and at a camera angle where the pure
    // knee-angle trigger already fails (see HIP_DROP_DOWN comment above), small real L/R
    // asymmetries get exaggerated the same way — confirmed empirically (kneeSym reached 50+
    // degrees during a genuine, controlled squat at an eye-level camera). Applying it to the
    // hip-drop path would defeat the point of adding a camera-angle-robust signal. footDiff
    // (ankle L/R level-ness) stays a shared gate for both when ankleTrusted — it held
    // reliably low throughout the same test, so it's not camera-angle-fragile, just
    // ankle-visibility-fragile like everything else ankle-derived here.
    const angleTrigger = ankleTrusted && angle < BOTTOM_ANGLE && kneeSym < KNEE_SYM_DOWN;
    const hipTrigger = ankleTrusted && hipDropFrac > HIP_DROP_DOWN;
    // Ankle-independent depth trigger — see THIGH_DROP_DOWN above. The only depth signal
    // that still works when the camera framing doesn't reach the ankles at all.
    const thighTrigger = thighDropFrac > THIGH_DROP_DOWN;
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
    const goodDepth =
      (ankleTrusted && angle >= PERFECT_MIN && angle <= PERFECT_MAX) ||
      (ankleTrusted && hipDropFrac > HIP_DROP_DOWN) ||
      thighDropFrac > THIGH_DROP_DOWN;
    // footDiff only gates when ankleTrusted — an untrusted ankle's L/R Y-difference is
    // meaningless and would otherwise block a legitimate thighTrigger-based rep.
    if (this.stage === 'UP' && (angleTrigger || hipTrigger || thighTrigger) && (!ankleTrusted || footDiff < FOOT_DIFF_DOWN)) {
      this.stage = 'DOWN';
      this.squatFormGood = goodDepth && lean < LEAN_BAD;
    }

    // Track the BEST (smallest/most-standing) hipY seen across the whole set (see the note
    // above — deliberately not reset per rep), instead of overwriting the reference with
    // whatever the latest genuinely-standing frame happens to show. Confirmed via a
    // second [SQUAT] log round: a single frame during a fast
    // bounce between reps briefly smoothed-angle-crossed STANDING_ANGLE without the user
    // actually being fully upright (standingHipY got set to 0.658, when true standing was
    // consistently ~0.54-0.56 elsewhere in the same log) — that alone was enough to keep
    // hipDropFrac from ever crossing HIP_DROP_DOWN, even on a clean, deep, symmetric squat.
    // Only updating when a frame is BETTER than what's already recorded makes the reference
    // converge to, and stay at, the true standing position and ignore worse transient readings.
    // Gated on genuinelyStanding (not raw angle > STANDING_ANGLE) so this still converges via
    // the thigh-based path when ankle isn't trusted — otherwise standingThighLength could
    // never be captured at all when ankle confidence never recovers for a whole session.
    if (genuinelyStanding && (this.standingHipY == null || hipY < this.standingHipY)) {
      this.standingHipY = hipY;
      this.standingLegLength = Math.max(ankleY - hipY, 1e-6);
      this.standingThighLength = Math.max(kneeY - hipY, 1e-6);
    }

    if (DEBUG_SQUAT && shouldLogFsmFrame()) {
      console.log(
        `[SQUAT] stage=${this.stage} angle=${angle.toFixed(1)}° (L=${angleL.toFixed(1)} R=${angleR.toFixed(1)}) ankleTrusted=${ankleTrusted} ` +
        `hipY=${hipY.toFixed(3)} kneeY=${kneeY.toFixed(3)} ankleY=${ankleY.toFixed(3)} standingHipY=${this.standingHipY?.toFixed(3) ?? 'null'} ` +
        `standingLegLen=${this.standingLegLength?.toFixed(3) ?? 'null'} standingThighLen=${this.standingThighLength?.toFixed(3) ?? 'null'} ` +
        `hipDropFrac=${hipDropFrac.toFixed(3)} thighDropFrac=${thighDropFrac.toFixed(3)}(>${THIGH_DROP_DOWN}) ` +
        `footDiff=${footDiff.toFixed(3)}(<${FOOT_DIFF_DOWN}) kneeSym=${kneeSym.toFixed(1)}(<${KNEE_SYM_DOWN}) ` +
        `angleTrigger=${angleTrigger} hipTrigger=${hipTrigger} thighTrigger=${thighTrigger}`
      );
    }

    // The "not fully standing" restriction only applies when angle is trustworthy — an
    // untrusted ankle could put `angle` anywhere, which would otherwise risk spurious "Lean
    // back" warnings/status flicker from garbage data rather than a real lean. `lean` itself
    // (shoulder-hip only) stays reliable regardless of ankle visibility.
    const excessiveLean = lean > LEAN_BAD && (!ankleTrusted || angle < 155);
    let feedback: string;
    if (ankleTrusted && footDiff > FOOT_DIFF_BAD) {
      feedback = 'Keep both feet level';
    } else if (excessiveLean) {
      feedback = 'Lean back - straighten';
    } else if (ankleTrusted && kneeSym > KNEE_SYM_BAD && angle < 155) {
      feedback = 'Distribute weight evenly';
    } else if (genuinelyStanding) {
      feedback = 'Go Down';
    } else if (ankleTrusted && angle < TOO_LOW_ANGLE) {
      feedback = 'Too Low - rise slightly';
    } else if (goodDepth) {
      feedback = 'Perfect Squat Depth';
    } else {
      feedback = 'Keep Going Down';
    }

    let status: 'good' | 'adjust' | 'error' | 'guide';
    if (this.stage === null) {
      status = 'guide';
    } else if ((ankleTrusted && footDiff > FOOT_DIFF_BAD) || excessiveLean || (ankleTrusted && kneeSym > KNEE_SYM_BAD && angle < 155) || (ankleTrusted && angle < TOO_LOW_ANGLE)) {
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
