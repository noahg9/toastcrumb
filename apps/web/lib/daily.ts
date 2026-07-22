// apps/web/lib/daily.ts — SERVER ONLY.
//
// Derives the "daily challenge" (Epic 8) from static content. Depends transitively
// on content.ts's node:fs usage via getAllConcepts, so this module must never be
// imported from a "use client" component.
//
// Design (Story 8.1): same UTC calendar day -> same challenge for every user, computed
// purely from content + the calendar. Only getDailyChallenge() reads the wall clock
// (through its default arg) or the filesystem; every other export is pure.
//
// DailyChallenge is a derived web-side view, not persisted domain state, so it lives
// here rather than in @toastcrumb/types (mirrors how the graph view lives web-side).
// If Epic 12's email mirror later needs it server-shared, move it then.
import { getAllConcepts } from "./content";
import type { Concept } from "@toastcrumb/types";

export interface DailyChallenge {
  /** Deterministic, unique per source quiz card: `${conceptId}:${lessonId}:${cardIndex}`. */
  id: string;
  conceptId: string;
  conceptTitle: string;
  question: string;
  options: string[];
  /** Index into `options`. Stripped from the public view. */
  correctIndex: number;
  explanation?: string;
  /**
   * Per-distractor explanations (Story 10.2), index-aligned to `options`. Carried
   * through from the source quiz card so the daily's wrong-answer reveal can name
   * the specific misconception. Stripped from the public (pre-commit) view along
   * with the other answer fields.
   */
  optionExplanations?: string[];
}

/** Answer-free projection: what 8-2 may ship to the client before the user commits. */
export type PublicDailyChallenge = Omit<
  DailyChallenge,
  "correctIndex" | "explanation" | "optionExplanations"
>;

const MS_PER_DAY = 86_400_000;

/** Whole-day number for a date's UTC calendar day (time-of-day discarded). */
function utcDayNumber(date: Date): number {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("utcDayNumber: invalid Date");
  }
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY,
  );
}

// Fixed anchor. `new Date(Date.UTC(...))` is a constant timestamp (no clock read),
// so module load stays deterministic.
const EPOCH_DAY = utcDayNumber(new Date(Date.UTC(2026, 0, 1)));

/**
 * Deterministic map from a UTC calendar day to a pool index. Same day + same
 * poolLength -> same index for everyone; only repeats after the whole pool cycles.
 * Pure: no clock, no randomness, no I/O.
 */
export function dailyChallengeIndex(date: Date, poolLength: number): number {
  const offset = utcDayNumber(date) - EPOCH_DAY;
  // Double-mod keeps the result in [0, poolLength) for negative offsets too.
  return ((offset % poolLength) + poolLength) % poolLength;
}

/**
 * Human-facing "Daily #N" — a stable, monotonically increasing number derived from
 * the SAME UTC calendar-day identity getDailyChallenge selects by (not the pool
 * index, which repeats once the pool cycles). Everyone sees the same N on a given
 * UTC day; N === 1 on the epoch anchor day and grows by one each calendar day after.
 * Pure: no clock (date is injected), no randomness, no I/O.
 */
export function dailyChallengeNumber(date: Date = new Date()): number {
  return Math.max(1, utcDayNumber(date) - EPOCH_DAY + 1);
}

/**
 * Stable, content-derived pool: one DailyChallenge per checking quiz card, in the
 * natural concepts -> lessons -> cards iteration order. Pretests (Story 10.1) are
 * EXCLUDED — a pretest is a prediction meant to be answered before its concept is
 * taught, so it makes no sense as a standalone daily challenge. Pure (order
 * depends only on input).
 */
export function buildDailyPool(concepts: Concept[]): DailyChallenge[] {
  const pool: DailyChallenge[] = [];
  for (const concept of concepts) {
    const lessons = [...concept.lessons].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const lesson of lessons) {
      lesson.cards.forEach((card, cardIndex) => {
        if (card.type !== "quiz" || card.pretest) return;
        pool.push({
          id: `${concept.id}:${lesson.id}:${cardIndex}`,
          conceptId: concept.id,
          conceptTitle: concept.title,
          question: card.question,
          options: card.options,
          correctIndex: card.correctIndex,
          explanation: card.explanation,
          optionExplanations: card.optionExplanations,
        });
      });
    }
  }
  return pool;
}

/** Strip the answer fields for client delivery before commit. */
export function publicChallenge(c: DailyChallenge): PublicDailyChallenge {
  return {
    id: c.id,
    conceptId: c.conceptId,
    conceptTitle: c.conceptTitle,
    question: c.question,
    options: c.options,
  };
}

/**
 * The one challenge for the given (or current) UTC day. Returns null when there is
 * no content to draw from (mirrors content.ts's ENOENT -> [] contract) OR when the
 * content read/parse itself fails — 8.2's AC 8 requires a friendly "no challenge
 * today" page rather than a 500, so any read failure degrades to null instead of
 * propagating. This is the only export that reads the clock or the filesystem.
 */
export async function getDailyChallenge(
  date: Date = new Date(),
): Promise<DailyChallenge | null> {
  let concepts: Concept[];
  try {
    concepts = await getAllConcepts();
  } catch {
    return null;
  }
  const pool = buildDailyPool(concepts);
  if (pool.length === 0) return null;
  return pool[dailyChallengeIndex(date, pool.length)];
}

/**
 * Canonical UTC calendar-day identity string (YYYY-MM-DD) for a given (or
 * current) instant — the SAME day identity `getDailyChallenge` selects by, so
 * any caller needing a date key (e.g. the once-per-day localStorage lock) stays
 * in lockstep with selection instead of re-deriving it separately.
 */
export function challengeDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Human-facing label for a `YYYY-MM-DD` key (e.g. "Mon, Jul 6, 2026"), formatted
 * in UTC so it matches the challenge's calendar-day identity regardless of the
 * server's timezone. Centralized here so the archive listing, per-day metadata,
 * and OG images (Story 8.5) all render the same date the same way.
 */
export function humanDailyDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Midnight-UTC Date for a whole-day number (inverse of utcDayNumber). */
function dateFromDayNumber(dayNumber: number): Date {
  return new Date(dayNumber * MS_PER_DAY);
}

/**
 * Strict `YYYY-MM-DD` → midnight-UTC Date, or null if malformed / not a real
 * calendar date (Date.UTC normalizes overflow silently, so we round-trip-check
 * the parts). Keeps day-key parsing centralized here instead of in route code.
 */
export function parseDailyDateKey(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (Number.isNaN(ms)) return null;
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }
  return back;
}

export type DailyDateClass =
  | "malformed"
  | "pre-epoch"
  | "future"
  | "today"
  | "past";

/**
 * Classify a requested dated-challenge key against the epoch and the current UTC
 * day. The dated route uses this to decide 404 (malformed / pre-epoch), redirect
 * to canonical /daily (today / future — nobody farms tomorrow's answer), or
 * render (past). Pure: `now` injected, epoch math stays in this one module.
 */
export function classifyDailyDate(
  dateKey: string,
  now: Date = new Date(),
): DailyDateClass {
  const parsed = parseDailyDateKey(dateKey);
  if (parsed === null) return "malformed";
  const day = utcDayNumber(parsed);
  const today = utcDayNumber(now);
  if (day < EPOCH_DAY) return "pre-epoch";
  if (day > today) return "future";
  if (day === today) return "today";
  return "past";
}

/**
 * How far back the archive lists (Story 8.4, owner-confirmed). The window is the
 * most recent N days up to today; older days are hidden with a visible note.
 */
export const DAILY_ARCHIVE_CAP_DAYS = 90;

/** One answer-free archive row. Never carries the question/options/answer. */
export interface DailyArchiveEntry {
  /** YYYY-MM-DD UTC identity — links to /daily/[date]. */
  date: string;
  challengeNumber: number;
  conceptId: string;
  conceptTitle: string;
}

export interface DailyArchive {
  /** Most-recent-first, spoiler-free. */
  entries: DailyArchiveEntry[];
  /** True when older days exist beyond the window (drives the truncation note). */
  truncated: boolean;
  cap: number;
}

/**
 * Pure archive projection (`now` injected): the daily challenges from today back
 * to `max(EPOCH_DAY, today − cap + 1)` — i.e. exactly `cap` days inclusive of
 * today — most-recent-first, carrying ONLY the concept
 * identity + Daily #N — never the answer (the listing must stay spoiler-free so
 * catch-up plays aren't ruined). Reuses the same pool + day math as selection.
 */
export function buildDailyArchive(
  concepts: Concept[],
  now: Date = new Date(),
  cap: number = DAILY_ARCHIVE_CAP_DAYS,
): DailyArchive {
  const pool = buildDailyPool(concepts);
  if (pool.length === 0) return { entries: [], truncated: false, cap };

  const todayDay = utcDayNumber(now);
  // Inclusive window of exactly `cap` days ending at today (today + cap-1 prior),
  // matching the "Showing the last {cap} days" note. `+ 1` keeps the count from
  // being cap+1 (both loop endpoints are inclusive).
  const startDay = Math.max(EPOCH_DAY, todayDay - cap + 1);
  const truncated = todayDay - cap + 1 > EPOCH_DAY;

  const entries: DailyArchiveEntry[] = [];
  for (let day = todayDay; day >= startDay; day--) {
    const date = dateFromDayNumber(day);
    const challenge = pool[dailyChallengeIndex(date, pool.length)];
    entries.push({
      date: challengeDateKey(date),
      challengeNumber: dailyChallengeNumber(date),
      conceptId: challenge.conceptId,
      conceptTitle: challenge.conceptTitle,
    });
  }
  return { entries, truncated, cap };
}

/**
 * Server entry point for the archive page: reads content, degrades to an empty,
 * non-truncated archive on any read failure (mirrors getDailyChallenge's ENOENT
 * → friendly-empty contract). This is the only impure step (clock + filesystem).
 */
export async function getDailyArchive(
  now: Date = new Date(),
): Promise<DailyArchive> {
  let concepts: Concept[];
  try {
    concepts = await getAllConcepts();
  } catch {
    return { entries: [], truncated: false, cap: DAILY_ARCHIVE_CAP_DAYS };
  }
  return buildDailyArchive(concepts, now);
}
