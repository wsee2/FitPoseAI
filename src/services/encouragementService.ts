// Rule-based, on-device contextual encouragement — separate from and additive to the FSMs'
// own form-correction feedback. No LLM, no network call, no per-frame heavy work: this only
// does anything on the (rare) frames where a rep/hold-second just advanced.
//
// Priority rule: encouragement NEVER overrides an urgent form correction. peekReps/peekHold
// only ever return a candidate message when status is 'good' or 'guide' — on 'adjust'/'error'
// they return null so the caller falls back to the FSM's own feedback string, unchanged from
// today. A returned message is NOT considered spoken until the caller calls confirmSpoken()
// (see ttsService.speakFeedback's boolean return) — so a message that loses the rate-limit
// race on one frame just stays pending and gets offered again next frame, never lost, never
// stacked on top of a correction.
//
// Only ONE message is ever held pending at a time (not a FIFO queue) — confirmed on-device
// this matters: "3 more"/"2 more"/"last one"/"target reached" all cluster within the final 3
// reps, easily faster than ttsService's ~3s rate gate can drain a backlog. A FIFO would let
// "2 more!" sit unspoken until the gate finally freed up several reps later, by which point
// the user had already passed the target — a stale, factually wrong message. A newer,
// more-relevant message now simply replaces whatever was still pending.

export type FormStatus = 'good' | 'adjust' | 'error' | 'guide';

const NEAR_END_REMAINING_MESSAGES: Record<number, string> = {
  3: '3 more to go!',
  2: '2 more!',
  1: "Last one - you've got this!",
};

const PRAISE_STREAK = 5; // consecutive good-form reps before a praise message
const PRAISE_MESSAGES = [
  'Great form, keep it up!',
  "You're crushing it!",
  'Excellent technique!',
  'Looking strong!',
];

const EXTRA_MILESTONE_INTERVAL = 5; // reps past target between periodic praise
const PAST_TARGET_MESSAGES = ['Beyond your goal - amazing!', 'Bonus reps - nice!', "You're on a roll!"];

// Fatigue: baseline = avg of the first BASELINE_REPS inter-rep gaps (locked in early, never
// re-baselined), recent = avg of the last RECENT_REPS gaps (a genuine rolling window since
// only the array's tail is read). Needs both windows filled before it can ever fire.
const BASELINE_REPS = 3;
const RECENT_REPS = 3;
const FATIGUE_SLOWDOWN_RATIO = 1.5;
const FATIGUE_MESSAGES = [
  "You're slowing a little - push through, you've got this!",
  'Take a breath if you need to.',
];

const PLANK_HALFWAY_MSG = 'Halfway - hold steady!';
const PLANK_WARN_REMAINING = 10;
const PLANK_WARN_MSG = '10 seconds left!';
const PLANK_TARGET_MSG = 'Target reached - great hold!';
const PLANK_EXTRA_INTERVAL = 15; // seconds past target between periodic praise
const PLANK_PAST_TARGET_MESSAGES = ['Still holding strong!', "You've got this!"];

/** Picks a random pool entry that isn't the same as the last one picked (unless pool.length===1). */
function pickVaried(pool: string[], lastIndex: number): { message: string; index: number } {
  if (pool.length === 1) return { message: pool[0], index: 0 };
  let idx = Math.floor(Math.random() * pool.length);
  if (idx === lastIndex) idx = (idx + 1) % pool.length;
  return { message: pool[idx], index: idx };
}

export class EncouragementEngine {
  private target = 1;
  private pending: string | null = null;

  // Rep-based milestone one-shot flags
  private lastCounter = 0;
  private halfwayFired = false;
  private nearEnd3Fired = false;
  private nearEnd2Fired = false;
  private nearEnd1Fired = false;
  private targetReachedFired = false;
  private lastExtraMilestoneAt = 0;
  private lastPastTargetIndex = -1;

  // Form-streak praise
  private goodStreak = 0;
  private lastPraiseIndex = -1;

  // Fatigue pace tracking
  private repDurationsMs: number[] = [];
  private lastRepTimestamp: number | null = null;
  private skipNextDurationMeasurement = false;
  private fatigueArmed = true;
  private lastFatigueIndex = -1;

  // Plank (time-based) milestone one-shot flags
  private lastHoldSeconds = 0;
  private plankHalfwayFired = false;
  private plankWarnFired = false;
  private plankTargetReachedFired = false;
  private plankLastExtraAt = 0;
  private lastPlankPastTargetIndex = -1;

  /** Call whenever a new session/exercise starts (same lifecycle as the FSMs' reset()). */
  reset(target: number): void {
    this.target = Math.max(target, 1);
    this.pending = null;
    this.lastCounter = 0;
    this.halfwayFired = false;
    this.nearEnd3Fired = false;
    this.nearEnd2Fired = false;
    this.nearEnd1Fired = false;
    this.targetReachedFired = false;
    this.lastExtraMilestoneAt = 0;
    this.lastPastTargetIndex = -1;
    this.goodStreak = 0;
    this.lastPraiseIndex = -1;
    this.repDurationsMs = [];
    this.lastRepTimestamp = null;
    this.skipNextDurationMeasurement = false;
    this.fatigueArmed = true;
    this.lastFatigueIndex = -1;
    this.lastHoldSeconds = 0;
    this.plankHalfwayFired = false;
    this.plankWarnFired = false;
    this.plankTargetReachedFired = false;
    this.plankLastExtraAt = 0;
    this.lastPlankPastTargetIndex = -1;
  }

  /**
   * Call when the chat overlay opens (same moment as the FSMs' pauseForChat()). Drops any
   * not-yet-spoken message — by the time the user returns, the moment it was tied to has
   * passed — and discards the in-flight rep-pace timestamp so the chat duration itself is
   * never misread as a slow rep (see skipNextDurationMeasurement). Milestone-fired flags and
   * the good-form streak are deliberately NOT reset here, same as the FSMs keep counter/score.
   */
  pauseForChat(): void {
    this.pending = null;
    this.lastRepTimestamp = null;
    this.skipNextDurationMeasurement = true;
  }

  /** Overwrites, doesn't append — see the class-level comment on why only one message is
   *  ever held pending at a time. */
  private enqueue(message: string): void {
    this.pending = message;
  }

  private evaluateFatigue(): void {
    if (this.repDurationsMs.length < BASELINE_REPS + RECENT_REPS) return;
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const baseline = avg(this.repDurationsMs.slice(0, BASELINE_REPS));
    const recent = avg(this.repDurationsMs.slice(-RECENT_REPS));
    const ratio = recent / baseline;
    if (ratio >= FATIGUE_SLOWDOWN_RATIO) {
      if (this.fatigueArmed) {
        const { message, index } = pickVaried(FATIGUE_MESSAGES, this.lastFatigueIndex);
        this.enqueue(message);
        this.lastFatigueIndex = index;
        this.fatigueArmed = false;
      }
    } else {
      this.fatigueArmed = true; // pace recovered — a later re-slowdown can fire again
    }
  }

  /**
   * Feed the fresh rep counter + form status for a rep-based exercise (squat/lunge/pushup/
   * situp). Returns a message to speak THIS frame, or null (no message pending, or one is
   * pending but status is 'adjust'/'error' — form correction takes priority, message stays
   * queued for a later good-form frame). Call every frame; cheap when nothing changed.
   */
  peekReps(counter: number, status: FormStatus): string | null {
    if (counter > this.lastCounter) {
      this.lastCounter = counter;

      // Rep-pace timing for the fatigue nudge.
      const now = Date.now();
      if (this.lastRepTimestamp != null) {
        if (this.skipNextDurationMeasurement) {
          this.skipNextDurationMeasurement = false;
        } else {
          this.repDurationsMs.push(now - this.lastRepTimestamp);
          this.evaluateFatigue();
        }
      }
      this.lastRepTimestamp = now;

      // Form-streak praise.
      if (status === 'good') {
        this.goodStreak += 1;
        if (this.goodStreak >= PRAISE_STREAK) {
          const { message, index } = pickVaried(PRAISE_MESSAGES, this.lastPraiseIndex);
          this.enqueue(message);
          this.lastPraiseIndex = index;
          this.goodStreak = 0;
        }
      } else {
        this.goodStreak = 0;
      }

      // Milestones — exact-count checks are safe here because every FSM increments counter
      // by exactly 1 per rep (no skipping), unlike plank's holdSeconds below.
      const halfwayAt = Math.ceil(this.target / 2);
      if (!this.halfwayFired && counter === halfwayAt && counter < this.target) {
        this.enqueue('Halfway there, keep going!');
        this.halfwayFired = true;
      }
      if (!this.nearEnd3Fired && counter === this.target - 3) {
        this.enqueue(NEAR_END_REMAINING_MESSAGES[3]);
        this.nearEnd3Fired = true;
      }
      if (!this.nearEnd2Fired && counter === this.target - 2) {
        this.enqueue(NEAR_END_REMAINING_MESSAGES[2]);
        this.nearEnd2Fired = true;
      }
      if (!this.nearEnd1Fired && counter === this.target - 1) {
        this.enqueue(NEAR_END_REMAINING_MESSAGES[1]);
        this.nearEnd1Fired = true;
      }
      if (!this.targetReachedFired && counter === this.target) {
        this.enqueue('Target reached - great work!');
        this.targetReachedFired = true;
        this.lastExtraMilestoneAt = this.target;
      } else if (this.targetReachedFired && counter - this.lastExtraMilestoneAt >= EXTRA_MILESTONE_INTERVAL) {
        this.lastExtraMilestoneAt = counter;
        const { message, index } = pickVaried(PAST_TARGET_MESSAGES, this.lastPastTargetIndex);
        this.enqueue(message);
        this.lastPastTargetIndex = index;
      }
    }

    if (this.pending == null) return null;
    if (status === 'error' || status === 'adjust') return null;
    return this.pending;
  }

  /**
   * Feed the fresh hold time + form status for plank. Same peek semantics as peekReps.
   * Milestones use >=-crossing rather than exact equality, since holdSeconds (derived from
   * wall-clock elapsed time, see plankFsm.ts) can jump by more than 1 across a low-confidence
   * gap, unlike a rep counter which only ever increments by exactly 1.
   */
  peekHold(holdSeconds: number, status: FormStatus): string | null {
    if (holdSeconds > this.lastHoldSeconds) {
      this.lastHoldSeconds = holdSeconds;

      const halfwayAt = Math.ceil(this.target / 2);
      if (!this.plankHalfwayFired && holdSeconds >= halfwayAt && holdSeconds < this.target) {
        this.enqueue(PLANK_HALFWAY_MSG);
        this.plankHalfwayFired = true;
      }
      const warnAt = this.target - PLANK_WARN_REMAINING;
      if (!this.plankWarnFired && warnAt > 0 && holdSeconds >= warnAt && holdSeconds < this.target) {
        this.enqueue(PLANK_WARN_MSG);
        this.plankWarnFired = true;
      }
      if (!this.plankTargetReachedFired && holdSeconds >= this.target) {
        this.enqueue(PLANK_TARGET_MSG);
        this.plankTargetReachedFired = true;
        this.plankLastExtraAt = this.target;
      } else if (this.plankTargetReachedFired && holdSeconds - this.plankLastExtraAt >= PLANK_EXTRA_INTERVAL) {
        this.plankLastExtraAt = holdSeconds;
        const { message, index } = pickVaried(PLANK_PAST_TARGET_MESSAGES, this.lastPlankPastTargetIndex);
        this.enqueue(message);
        this.lastPlankPastTargetIndex = index;
      }
    }

    if (this.pending == null) return null;
    if (status === 'error' || status === 'adjust') return null;
    return this.pending;
  }

  /** Call after speakFeedback(message) returns true for a message this engine returned. */
  confirmSpoken(): void {
    this.pending = null;
  }
}
