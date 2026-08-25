import { calculateAngle, getKeypoint, type Keypoint } from '../poseMath';

const DEBUG_PLANK = true;

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

// LEGS_STRAIGHT_ANGLE lowered 138→130: MoveNet knee coords are noisy for horizontal poses.
// severeBad no longer includes !legsStraight — brief noisy frames now use the grace window
// instead of immediately freezing the timer.
const ELBOW_BENT_ANGLE = 135;
const SUPPORT_GAP_BENT = 0.034;
const SUPPORT_GAP_STRAIGHT = 0.018;
const LEGS_STRAIGHT_ANGLE = 130;
const BODY_STRAIGHT_ANGLE = 152;
const BODY_LEVEL_DIFF = 0.14;
const SEVERE_BODY_ANGLE = 138;
const SMOOTH_WINDOW = 5;
// Lowered 0.3→0.15, plankFsm-only (each FSM defines its own CONF_THRESHOLD; squat/lunge/
// pushup/situp are unaffected). Confirmed on-device across two separate sessions at the
// same camera placement that confidence for shoulder/hip/ankle (already trimmed down to
// the minimum required set — see below) is chronically marginal: session 1 had wrist/elbow
// as the bottleneck with shoulder/hip/ankle fine; session 2 had shoulder as the bottleneck
// (0.06-0.36) with hip/ankle fine. Different keypoint each time, hip the one consistently
// reliable point across both — this isn't one fixable weak joint, it's generally marginal
// tracking at this placement where whichever point is worst on a given frame becomes the
// bottleneck. 0.15 still rejects the most extreme values (0.04-0.09, likely genuine
// hallucination) while accepting the 0.16-0.29 range that was the dominant failure mode.
const CONF_THRESHOLD = 0.15;
const PLANK_GRACE = 10;

// REVERTED: tried self-calibrating BODY_STRAIGHT_ANGLE the same way squatFsm.ts
// self-calibrates HIP_DROP_DOWN (track the best bodyAngle seen, require staying within a
// tolerance of it). Confirmed on-device this does NOT work for plank, for a more
// fundamental reason than a cold-start bug: at floor-level camera height viewing a
// floor-level horizontal body, bodyAngle drifted 30°+ (143°→175°) during a single STATIC
// hold with no real form change — and a deliberately-bad (hips raised) attempt read the
// SAME ~143-147° as a genuinely correct one at this placement. When good and bad form
// produce indistinguishable readings, no threshold — fixed or calibrated — can separate
// them; calibrating just made it worse by chasing whatever the noisy value happened to be
// (falsely approving the bad start, then freezing a correct hold once it calibrated too
// strict). Back to the fixed threshold: safe (never praises obviously bad form) even
// though it means bodyAngle-based straightness genuinely doesn't work at extreme
// floor-level camera placements — that needs a camera reposition (angle it up slightly),
// not a software fix, since the hip-sag/pike motion is nearly parallel to the camera's own
// line of sight there and there's little real signal left to threshold on.

export interface PlankFsmState {
  holdSeconds: number;
  isHolding: boolean;
  feedback: string;
  bodyAngle: number | null;
  status: 'good' | 'adjust' | 'error' | 'guide';
}

export const INITIAL_PLANK_STATE: PlankFsmState = {
  holdSeconds: 0,
  isHolding: false,
  feedback: 'Get ready',
  bodyAngle: null,
  status: 'guide',
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

  /**
   * Finalizes any in-progress hold into plankHoldTime and stops the running wall-clock
   * timer, so the paused duration (chatting) is never added to the held time on resume.
   * Keeps plankHoldTime and clears only transient per-frame state.
   */
  pauseForChat(): void {
    if (this.plankStartTime !== null) {
      this.plankHoldTime += Date.now() / 1000 - this.plankStartTime;
      this.plankStartTime = null;
    }
    this.plankBadFrames = 0;
    this.bodySmoothBuffer = [];
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

    // Knees AND elbows/wrists excluded from required. Knees: legAngle is debug-log-only (see
    // the comment below). Elbows/wrists: confirmed on-device that requiring their confidence
    // made plank essentially unusable — an entire real session logged near-100% low-confidence
    // frames, dominated by chronic wrist confidence (often 0.04-0.16) even with the whole body
    // clearly framed. MoveNet Lightning's wrist/elbow keypoints are its structurally weakest,
    // and a plank's near-vertical forearm (hand under shoulder) is an awkward, easily
    // foreshortened/self-occluded configuration for them specifically — this looks like an
    // inherent model limitation for this pose, not a fixable camera or threshold issue.
    // torsoElevated (the one check that uses elbow/wrist) now runs on best-effort coordinates
    // regardless of confidence — noisier, but processing a noisy frame beats freezing on every
    // frame. Only shoulder/hip/ankle (what bodyAngle/bodyLevel actually need, and what tracks
    // reliably per the same log — hip in particular stayed 0.5-0.85 throughout) still gate.
    const required = [shoulderL, shoulderR, hipL, hipR, ankleL, ankleR];
    if (required.some((p) => p.conf < CONF_THRESHOLD)) {
      // Low-confidence frame (e.g. body partially out of view). Confirmed on-device this
      // could previously freeze the display for a long stretch: silently returning
      // lastState unchanged meant a stale "good"/green status (and a stale hold timer)
      // kept being redisplayed indefinitely, through form changes the FSM never actually
      // re-evaluated because it never got a confident-enough frame to do so. Finalize any
      // in-progress hold instead (same pattern as pauseForChat, so a later confident frame
      // doesn't retroactively count the untracked gap as held time) and report an honest
      // "not currently tracked" state.
      if (DEBUG_PLANK) {
        console.log(
          `[PLANK] LOW-CONFIDENCE FRAME, pausing — ` +
          `shoulderL=${shoulderL.conf.toFixed(2)} shoulderR=${shoulderR.conf.toFixed(2)} ` +
          `hipL=${hipL.conf.toFixed(2)} hipR=${hipR.conf.toFixed(2)} ` +
          `ankleL=${ankleL.conf.toFixed(2)} ankleR=${ankleR.conf.toFixed(2)}`
        );
      }
      if (this.plankStartTime !== null) {
        this.plankHoldTime += Date.now() / 1000 - this.plankStartTime;
        this.plankStartTime = null;
      }
      this.plankBadFrames = 0;
      this.lastState = {
        ...this.lastState,
        isHolding: false,
        holdSeconds: Math.floor(this.plankHoldTime),
        feedback: "Can't see you clearly - adjust position",
        status: 'guide',
      };
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
    // elbow/wrist confidence is no longer required (see above) — these run on best-effort
    // coordinates, which can be noisier than the required shoulder/hip/ankle points.
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
    // legAngle kept for the debug log only — NOT used to gate goodPlank/hold anymore.
    // Confirmed on-device: at this exact horizontal-floor placement, legAngle swung from
    // ~155-165° (genuinely straight) to ~95-104° within 2-3 frames while hip/ankle Y in the
    // raw [POSE] log were themselves jumping erratically — that's pose-tracking instability,
    // not a smooth camera-angle bias, so no tolerance window could absorb a swing that size
    // without also accepting a truly bent-knee plank. This is a continuation of this file's
    // existing precedent (see the
    // LEGS_STRAIGHT_ANGLE/severeBad comments above) of not letting noisy knee coords block
    // the hold — just taken one step further, since the grace window alone wasn't enough
    // for a *sustained* bad streak rather than a brief blip.
    const legsStraight = legAngle > LEGS_STRAIGHT_ANGLE;
    const bodyLevel = hDiff < BODY_LEVEL_DIFF;

    // bodyAngle/bodyStraight kept for the debug log only — NOT used to gate goodPlank/
    // severeBad anymore. Confirmed on-device across three separate placements (two
    // horizontal-floor sessions, one horizontal-table session) that this signal cannot
    // discriminate plank straightness at floor/table-adjacent camera heights: a genuinely
    // correct plank and a deliberately-bad (hips raised) one produced the SAME ~143-147°
    // reading in one test, and a real, stably-tracked plank read 123-141° against the fixed
    // 152° threshold in another — while self-calibrating against it (tried and reverted,
    // see above) only made things worse by chasing whatever the noisy value happened to be.
    // At these camera heights the hip-sag/pike motion this angle is meant to catch is
    // nearly parallel to the camera's own line of sight, so there just isn't reliable signal
    // left to threshold on — fixed or calibrated. torsoElevated/bodyLevel are both
    // position-based and have held up reliably across every test, so they're now the sole
    // gate: the tradeoff is losing sag/pike detection specifically at these placements, in
    // exchange for the hold timer actually working.
    const bodyStraight = bodyAngle > BODY_STRAIGHT_ANGLE;
    const goodPlank = bodyLevel && torsoElevated;
    // severeBad used to have a buffer below goodPlank's threshold (bodyAngle < a MUCH lower
    // SEVERE_BODY_ANGLE) so a brief, noisy near-miss consumed the PLANK_GRACE window instead
    // of instantly freezing. With bodyAngle removed, severeBad = !goodPlank exactly would
    // silently delete that buffer — any single noisy torsoElevated/bodyLevel frame would
    // freeze immediately. Restore the buffer on hDiff (continuous, and the more noise-prone
    // of the two remaining checks): only a hDiff blowout well past BODY_LEVEL_DIFF (as seen
    // during genuine tracking breakdown, e.g. hDiff=0.25-0.33 in a confirmed bad stretch)
    // triggers an immediate freeze; a borderline miss still gets the grace window.
    const severeBad = !torsoElevated || hDiff > BODY_LEVEL_DIFF * 2;

    const neverStarted = this.plankHoldTime === 0 && this.plankStartTime === null;

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

    if (DEBUG_PLANK) {
      const whyNot = !goodPlank
        ? ([
            !torsoElevated ? 'torsoElev' : null,
            !bodyLevel     ? 'bodyLevel' : null,
          ] as (string | null)[]).filter(Boolean).join('+')
        : '';
      console.log(
        `[PLANK] body=${bodyAngle.toFixed(1)}° hDiff=${hDiff.toFixed(3)} ` +
        `gap=${shoulderSupportGap.toFixed(3)} torsoElev=${torsoElevated} ` +
        `legsStraight=${legsStraight}(${legAngle.toFixed(1)}°) level=${bodyLevel} straight=${bodyStraight} ` +
        `good=${goodPlank} severe=${severeBad} hold=${totalHold.toFixed(1)}s running=${this.plankStartTime !== null}` +
        (whyNot ? ` WHY_NOT:${whyNot}` : '')
      );
    }

    let feedback: string;
    if (goodPlank) {
      feedback = 'Hold the plank';
    } else if (!torsoElevated) {
      feedback = 'Lift up - off the floor';
    } else {
      feedback = 'Keep body horizontal';
    }

    let status: 'good' | 'adjust' | 'error' | 'guide';
    if (neverStarted && !goodPlank) {
      status = 'guide';
    } else if (goodPlank) {
      status = 'good';
    } else if (severeBad) {
      status = 'error';
    } else {
      status = 'adjust';
    }

    this.lastState = {
      holdSeconds: Math.floor(totalHold),
      isHolding: this.plankStartTime !== null,
      feedback,
      bodyAngle,
      status,
    };
    return this.lastState;
  }
}
