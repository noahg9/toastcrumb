import type { ReviewState } from "@toastcrumb/types";

// Pure mastery-tier model (Story 9.6). Given a user's raw ReviewState rows (the
// live FSRS memory model, moved by 9.5 grading) + a `now`, it derives each
// concept's visible mastery tier — learning → reviewing → durable — and whether
// that memory is visibly decaying because reviews have lapsed.
//
// This is the "progress currency = the graph itself" visualisation: the tier a
// node shows IS its real memory strength, not a farmable side-currency
// (research/2026-07-04-learning-science.md:41). It sits ON TOP of lib/unlock.ts
// (which owns completed/available/locked gating) — mastery only enriches the
// `completed` status, never replaces the partition.
//
// Like unlock.ts/graph.ts this module is intentionally I/O-free (no node:fs, no
// Date.now() at module scope, no module-level mutable state, no React) so the
// "use client" skill tree can import it without dragging server-only code into
// the client bundle. `now` is an injectable param defaulting to `new Date()`.
//
// Decay is a coarse overdue ratio computed purely from the persisted row (owner
// Decision 1/3) — NOT the true FSRS retrievability curve, which would need
// ts-fsrs in the web bundle. `scheduledDays` was chosen by FSRS so retrievability
// ≈ 0.9 at `due`, so "overdue by a full interval again" is a legible
// "meaningfully faded" line. Presentational signal, not an authoritative
// memory-model number.

export type MasteryTier = "learning" | "reviewing" | "durable";

export interface MasteryInfo {
  /** The EFFECTIVE (post-decay) tier to render. */
  tier: MasteryTier;
  /** The pre-decay tier (for the sidebar to optionally explain a slip). */
  baseTier: MasteryTier;
  /** True when the concept is past its `due` at all. */
  decaying: boolean;
  /** 0..1 overdue ratio driving the proportional ring dim. */
  lateness: number;
}

export interface MasteryState {
  byId: Record<string, MasteryInfo>;
}

// FSRS state enum, mirrored locally so this module never imports ts-fsrs
// (owner Decision 1 — ts-fsrs stays API-only, off the web bundle).
const FSRS_STATE = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;

// Owner-resolved V1 tier boundaries (Decision 2), in FSRS stability-days. Tunable
// knobs. 21d ≈ "sticky enough to trust" at V1 desired-retention 0.9.
const DURABLE_STABILITY_DAYS = 21;
const REVIEWING_STABILITY_DAYS = 7;

const DAY_MS = 86_400_000;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

// One-step demotion floor at learning (owner Decision 3).
const demote = (tier: MasteryTier): MasteryTier =>
  tier === "durable" ? "reviewing" : "learning";

// Base tier from stability + FSRS state (owner Decision 2). `stability >= 21d`
// is durable regardless of state; a Review-state card with `7d ≤ stability < 21d`
// is reviewing; everything else (New/Learning/Relearning, or stability < 7d)
// reads as "learning".
function baseTierOf(row: ReviewState): MasteryTier {
  if (row.stability >= DURABLE_STABILITY_DAYS) return "durable";
  if (row.state === FSRS_STATE.Review && row.stability >= REVIEWING_STABILITY_DAYS)
    return "reviewing";
  return "learning";
}

// Mastery for one row: base tier, then decay (overdue ratio) may slip it one
// step. Only genuinely-scheduled Review-state cards can "lapse" — New/Learning/
// Relearning cards (including a just-completed, never-graded row: state=New,
// stability=0, due≈now) never show decay, so they read as "just learned, firming
// up", not fading (owner decision 2026-07-13, resolving the AC 4 fresh-card
// tension raised in /code-review). An unparseable `due` is treated as not
// decaying (overdueDays = 0).
function masteryOf(row: ReviewState, now: Date): MasteryInfo {
  const base = baseTierOf(row);
  const canDecay = row.state === FSRS_STATE.Review;
  const dueMs = Date.parse(row.due);
  const overdueDays = canDecay && !Number.isNaN(dueMs)
    ? (now.getTime() - dueMs) / DAY_MS
    : 0;
  const decaying = overdueDays > 0;
  // Floor scheduledDays at 1d: avoids divide-by-zero and over-sensitivity for
  // short (minutes-scale) learning-step cards whose scheduledDays is 0.
  const lateness = clamp(overdueDays / Math.max(row.scheduledDays, 1), 0, 1);
  const tier = lateness >= 1 ? demote(base) : base;
  return { tier, baseTier: base, decaying, lateness };
}

/**
 * Derive per-concept mastery from a user's ReviewState rows. Pure and
 * deterministic. `byId` is keyed by `conceptId`; a concept with no row simply
 * has no entry (the skill tree leaves such nodes at their unlock status). Never
 * throws on malformed input.
 */
export function deriveMastery(
  rows: ReviewState[],
  now: Date = new Date(),
): MasteryState {
  const byId: Record<string, MasteryInfo> = {};
  for (const row of rows) {
    byId[row.conceptId] = masteryOf(row, now);
  }
  return { byId };
}
