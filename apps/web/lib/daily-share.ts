// apps/web/lib/daily-share.ts — CLIENT-SAFE, PURE.
//
// Builds the spoiler-free share block for the daily challenge (Story 8.3).
// Wordle canon: encode ONLY the sharer's pass/fail outcome + challenge identity +
// a link. It MUST NOT contain the question, any option, the correct answer, or the
// explanation — a reader learns *whether* the sharer got it right, never *what* the
// answer was. That spoiler-free property is what makes the loop shareable.
//
// Deliberately does NOT import ./daily (server-only — transitively pulls node:fs via
// content.ts). The challenge number arrives as a plain value so this module stays in
// the client bundle without dragging server-only code in.

export interface DailyShareInput {
  /** Human-facing "Daily #N" (from server-side dailyChallengeNumber). */
  challengeNumber: number;
  /** Did the sharer get today's challenge right? */
  correct: boolean;
  /** Absolute link back to the challenge, e.g. `${baseUrl}/daily`. */
  url: string;
  /**
   * Optional daily-challenge streak. Story 8.3 leaves this unset; Story 8.4 wires it
   * in without restructuring — when present a `🔥 <n> day streak` line is inserted
   * between the emoji trace and the URL. Values < 1 are ignored (treated as no streak).
   */
  streak?: number;
}

/** 🟩 = nailed it, 🟥 = missed. */
const PASS = "🟩";
const FAIL = "🟥";

/**
 * Build the compact, tweet-sized share block. Today the daily challenge is a single
 * quiz card, so the emoji trace is a single square; the trace is assembled as an
 * array of squares so a future multi-concept day is a trivial extension (join more
 * squares) rather than a rewrite.
 */
export function buildDailyShareText({
  challengeNumber,
  correct,
  url,
  streak,
}: DailyShareInput): string {
  const trace = [correct ? PASS : FAIL].join("");
  const lines = [`ToastCrumb Daily #${challengeNumber}`, trace];
  if (typeof streak === "number" && streak >= 1) {
    lines.push(`🔥 ${streak} day streak`);
  }
  // Blank line before the URL keeps the link visually separated (matches the
  // exact copy in the story's Share-text format).
  lines.push("", url);
  return lines.join("\n");
}
