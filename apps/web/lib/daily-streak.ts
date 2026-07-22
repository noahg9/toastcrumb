// apps/web/lib/daily-streak.ts — CLIENT-SAFE, PURE.
//
// The local, logged-out sibling of the server-side account streak
// (apps/api/src/users/users.service.ts `nextStreak`). Story 8.4 derives the
// daily-challenge streak entirely from the set of UTC calendar-days the visitor
// has already played (the date-scoped `toastcrumb_daily_<YYYY-MM-DD>` keys from
// Story 8.2) — no new persisted counter, no account, no API.
//
// It MUST NOT import ./daily or ./content (both server-only — they transitively
// pull node:fs via content.ts). The minimal `YYYY-MM-DD` day math it needs is
// re-implemented here, purely, from injected values — the enclosing component
// injects `todayKey` and the enumerated played keys, so nothing here reads the
// clock, storage, or the filesystem.

const MS_PER_DAY = 86_400_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// The daily challenge did not exist before this UTC day (mirrors EPOCH_DAY in
// ./daily, re-derived here to keep this module import-free). Days before it can
// only appear via tampering or a wrong client clock; the streak must not count
// them, or it could exceed the challenge's real lifetime.
const EPOCH_DAY = Math.floor(Date.UTC(2026, 0, 1) / MS_PER_DAY);

/**
 * Whole-day number for a strict `YYYY-MM-DD` UTC calendar day, or null if the
 * string is malformed or not a real calendar date (e.g. `2026-13-40`). Pure:
 * parses the injected string, never reads the clock.
 */
function dayNumberFromKey(key: string): number | null {
  if (!DATE_KEY.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (Number.isNaN(ms)) return null;
  // Reject values that rolled over (e.g. month 13, day 40) — Date.UTC normalizes
  // silently, so compare the round-trip back to the input day parts.
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Current daily-challenge streak: the length of the maximal run of consecutive
 * UTC calendar days, ending at today or (grace window) yesterday, that appear in
 * `playedDayKeys`. Mirrors the server `nextStreak` semantics expressed set-wise:
 *
 *   - never played, or neither today nor yesterday played → 0 (silent reset)
 *   - played today                                        → 1 + consecutive days before
 *   - played yesterday but not today (grace)              → run ending yesterday
 *
 * Pure: `todayKey` and the played keys are injected; no clock, storage, or I/O.
 * Malformed keys are ignored defensively. Always returns a non-negative integer.
 */
export function currentDailyStreak(
  playedDayKeys: string[],
  todayKey: string,
): number {
  const today = dayNumberFromKey(todayKey);
  if (today === null) return 0;

  const played = new Set<number>();
  for (const key of playedDayKeys) {
    const day = dayNumberFromKey(key);
    if (day !== null) played.add(day);
  }

  // Anchor the run at today if played, else yesterday (grace window), else the
  // run is dead.
  let anchor: number;
  if (played.has(today)) anchor = today;
  else if (played.has(today - 1)) anchor = today - 1;
  else return 0;

  let streak = 0;
  for (let day = anchor; day >= EPOCH_DAY && played.has(day); day--) {
    streak++;
  }
  return streak;
}

/**
 * A lightweight-nod milestone: every 7th consecutive day (7, 14, 21, …).
 * Full celebration (confetti/modal) is Story 11.5 — this only gates the small
 * text line. Pure and trivially eyeball-checkable.
 */
export function isMilestone(streak: number): boolean {
  return Number.isInteger(streak) && streak >= 7 && streak % 7 === 0;
}
