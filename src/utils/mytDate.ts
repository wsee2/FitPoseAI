/**
 * All in-app date boundaries ("today", session dates, day/week chips) are anchored to
 * Malaysia time (UTC+8) regardless of the device's own timezone setting. Malaysia has no
 * daylight-saving, so a fixed offset is exact year-round — no timezone database needed.
 *
 * Dates returned by nowInMYT()/todayInMYT() (and arithmetic built on them) are "shifted":
 * their UTC fields (getUTCFullYear/getUTCMonth/getUTCDate/getUTCDay/setUTCDate/...) hold
 * the Malaysia wall-clock values. Always read/write those dates via the UTC getters/setters
 * — never the local ones (getDate/getDay/setDate/...), which would reflect the device's
 * own timezone instead and reintroduce the same mismatch this module exists to avoid.
 */
export const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Current instant, shifted so its UTC fields read as Malaysia wall-clock time. */
export function nowInMYT(): Date {
  return new Date(Date.now() + MYT_OFFSET_MS);
}

/** Midnight today in Malaysia (shifted — see module docs). */
export function todayInMYT(): Date {
  const d = nowInMYT();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Formats a shifted Date as its Malaysia calendar date, "YYYY-MM-DD". */
export function mytDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Malaysia calendar date ("YYYY-MM-DD") for right now. Use for session timestamps. */
export function todayMYTDateStr(): string {
  return mytDateStr(nowInMYT());
}

/** Parses a "YYYY-MM-DD" Malaysia calendar date string back into a shifted Date. */
export function parseMYTDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
