import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ReviewState } from "@prisma/client";
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Desired retention — the probability of successful recall the FSRS scheduler
 * targets at each review. 0.9 is the research spec (research/2026-07-04-*) and
 * also the ts-fsrs default. A single tunable knob for V1 (Story 9.1 Q3: not a
 * per-user column).
 *
 * Defined as a LOCAL runtime constant on purpose: the API imports
 * `@toastcrumb/types` as `import type` only (docs/ARCHITECTURE.md Coding
 * Standards), so runtime values are duplicated in the API rather than consumed
 * from the package (same policy as XP_PER_LESSON in users.service.ts).
 */
export const DEFAULT_DESIRED_RETENTION = 0.9;

/**
 * Map a persisted `ReviewState` row to a ts-fsrs `Card`. Field-for-field so the
 * reloaded card behaves identically to the in-memory one — including
 * `learning_steps`, without which a card never graduates out of the learning
 * phase (Story 9.1 dev notes: round-trip fidelity).
 */
function toCard(row: ReviewState): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    // Persisted as the numeric enum value; widen back to the State enum.
    state: row.state as State,
    last_review: row.lastReview ?? undefined,
  };
}

/**
 * Map a ts-fsrs `Card` to the `ReviewState` columns it owns. Usable as both the
 * `create` payload (with userId/conceptId spread alongside) and the `update`
 * payload after a grade. Inverse of `toCard`.
 */
function fromCard(card: Card) {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due,
    lastReview: card.last_review ?? null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
  };
}

/**
 * Derive a recall `Grade` from one review's quiz-card outcomes (Story 9.5,
 * owner-resolved Decision 1: proportion-correct, 3-level, no latency signal).
 * Pure — no I/O, no clock — trivially unit-verifiable in isolation.
 *
 * `Rating.Easy` is never returned: no latency/confidence signal exists
 * anywhere in the codebase to justify it (reserved for a possible future
 * enhancement, out of scope here).
 */
export function deriveGrade(correctCount: number, totalCount: number): Grade {
  if (!Number.isInteger(totalCount) || totalCount <= 0) {
    throw new Error(`totalCount must be a positive integer, got ${totalCount}`);
  }
  if (
    !Number.isInteger(correctCount) ||
    correctCount < 0 ||
    correctCount > totalCount
  ) {
    throw new Error(
      `correctCount must be an integer in [0, ${totalCount}], got ${correctCount}`,
    );
  }
  if (correctCount <= 0) return Rating.Again;
  if (correctCount >= totalCount) return Rating.Good;
  return Rating.Hard;
}

/**
 * FSRS-6 review scheduler (Story 9.1 — Epic 9 spaced-review loop foundation).
 *
 * Wraps the `ts-fsrs` library (the canonical open-source FSRS impl) behind a
 * small service: initialize a concept's review state when it is introduced,
 * advance that state from a recall grade, and read the rows due for a user.
 * This story delivers ONLY the scheduler + schema; serving reviews to the UI
 * (9.2), composing the daily session (9.3), the grading endpoint (9.5) etc.
 * build on top of these methods.
 */
@Injectable()
export class ReviewsService {
  // One scheduler instance, tuned to the desired-retention knob above.
  // enable_fuzz spreads due dates slightly to avoid review pile-ups.
  private readonly scheduler = fsrs(
    generatorParameters({
      request_retention: DEFAULT_DESIRED_RETENTION,
      enable_fuzz: true,
    }),
  );

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seed the review schedule for a newly-introduced concept. Creates a fresh
   * FSRS card at `now` (state New, due = now → the first review lands within
   * ~24h, AC 5). Idempotent: if a schedule already exists for (user, concept)
   * this is a no-op, so a replay / double-completion never resets an
   * in-progress schedule to New (AC 6).
   */
  initForConcept(userId: string, conceptId: string, now: Date = new Date()) {
    const card = createEmptyCard(now);
    return this.prisma.reviewState.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      create: { userId, conceptId, ...fromCard(card) },
      update: {}, // already introduced: preserve the existing schedule
    });
  }

  /**
   * Apply a recall grade (ts-fsrs `Rating`) to a concept's review state: load
   * the row, advance the FSRS card, persist the new card fields, and return the
   * updated row. The pure scheduler step the 9.5 grading endpoint calls.
   *
   * Concurrency-safe (Story 9.5, closing a 9.1-deferred race): the write is a
   * compare-and-swap keyed on the row's own `updatedAt` snapshot (read at the
   * top of this call), via `updateMany`'s `where` clause. Postgres's row-level
   * `UPDATE ... WHERE` semantics make this atomic with no `$transaction`
   * needed. A `count === 0` means a concurrent grade raced between our read
   * and this write — surfaced as a 409 so the caller can retry rather than
   * silently losing an update.
   */
  async applyGrade(
    userId: string,
    conceptId: string,
    rating: Grade,
    now: Date = new Date(),
  ) {
    const row = await this.prisma.reviewState.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });
    if (!row) {
      throw new NotFoundException(
        `no review state for user ${userId}, concept ${conceptId}`,
      );
    }
    const { card } = this.scheduler.next(toCard(row), now, rating);
    const { count } = await this.prisma.reviewState.updateMany({
      where: { userId, conceptId, updatedAt: row.updatedAt },
      data: fromCard(card),
    });
    if (count === 0) {
      throw new ConflictException(
        `review state for ${userId}/${conceptId} changed concurrently`,
      );
    }
    const fresh = await this.prisma.reviewState.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });
    if (!fresh) {
      throw new ConflictException(
        `review state for ${userId}/${conceptId} was removed concurrently`,
      );
    }
    return fresh;
  }

  /**
   * Derive-then-apply wrapper (Story 9.5) — the one public entry point
   * `UsersService` calls. `UsersService` never derives a grade or touches FSRS
   * internals directly; it only knows a review happened and how it went.
   */
  async recordReviewOutcome(
    userId: string,
    conceptId: string,
    correctCount: number,
    totalCount: number,
    now: Date = new Date(),
  ) {
    const rating = deriveGrade(correctCount, totalCount);
    return this.applyGrade(userId, conceptId, rating, now);
  }

  /**
   * The user's review states currently due (`due <= now`), soonest first. The
   * read the 9.3 session composer (and 9.5 grading) builds on; exposed as
   * `GET /users/:userId/reviews` by ReviewsController in 9.3.
   *
   * `take: 50` is a runaway-safety bound (resolves the deferred "no pagination
   * bound" — deferred-work.md 9.1), NOT the session cap: the session itself
   * consumes ≤5; the cap lives web-side in `composeSession`. The secondary
   * `conceptId` sort makes ties on `due` deterministic — every introduced
   * concept currently shares `due = now` (reviews stay ungraded until 9.5), so
   * without it equal-`due` rows would come back in arbitrary SQL order and the
   * daily session would reshuffle its reviews run-to-run.
   */
  listDueForUser(userId: string, now: Date = new Date()) {
    return this.prisma.reviewState.findMany({
      where: { userId, due: { lte: now } },
      orderBy: [{ due: "asc" }, { conceptId: "asc" }],
      take: 50,
    });
  }

  /**
   * ALL of the user's review states (not just the due subset), `conceptId` asc
   * for deterministic output. Backs the graph mastery visualisation (Story 9.6):
   * the skill tree needs every completed concept's live FSRS strength, not only
   * what's due today, to paint per-node learning/reviewing/durable tiers.
   *
   * No `due` filter, no clock, no FSRS mutation — a pure read. `take: 500` is a
   * runaway-safety bound (mirrors `listDueForUser`'s `take: 50` rationale — the
   * 20-concept V1 content is far under it). The tier/decay math lives web-side in
   * `lib/mastery.ts`; the API stays a thin state store.
   */
  listAllForUser(userId: string) {
    return this.prisma.reviewState.findMany({
      where: { userId },
      orderBy: [{ conceptId: "asc" }],
      take: 500,
    });
  }

  /**
   * Read the review state for one (user, concept), or `null` when none exists
   * yet (Story 9.2). The web reads `lastVariantId` from this to pick a
   * not-recently-seen variant; 9.3/9.5 read the due/FSRS fields. Returning
   * `null` (rather than throwing) lets the caller treat "never introduced /
   * never reviewed" as `lastVariantId = null` without special-casing an error.
   */
  getForConcept(userId: string, conceptId: string) {
    return this.prisma.reviewState.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });
  }

  /**
   * Record the variant most recently SERVED as a review (Story 9.2). Writes
   * ONLY `lastVariantId` — never an FSRS field (stability/difficulty/due/reps/
   * lapses/state/…); grading is Story 9.5. `updateMany` (not `update`) so an
   * absent row is a safe no-op rather than a P2025/500: a review is only
   * reachable for an introduced concept (which already has a row from
   * `initForConcept`), so the no-op path is unreachable in practice — but we do
   * NOT fabricate a New FSRS card here, which would invent a bogus schedule.
   * Returns the affected-row count (0 = no schedule, treated as no-op).
   */
  async recordVariantSeen(
    userId: string,
    conceptId: string,
    lastVariantId: string,
  ) {
    const { count } = await this.prisma.reviewState.updateMany({
      where: { userId, conceptId },
      data: { lastVariantId },
    });
    return { updated: count };
  }
}
