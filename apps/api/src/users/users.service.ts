import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { EventInput } from "@toastcrumb/types";
import { PrismaService } from "../prisma/prisma.service";
import { ProgressService } from "../progress/progress.service";
import { ReviewsService } from "../reviews/reviews.service";

// Game-loop constants — source of truth: docs/GAME_LOOP.md.
export const XP_PER_LESSON = 10;
export const XP_PER_CORRECT_QUIZ = 5;
export const XP_PER_LEVEL = 100;

function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/**
 * One per-question difficulty outcome to persist (Story 10.5). Mirrors the
 * shared `QuizOutcome` interface in @toastcrumb/types — duplicated here rather
 * than imported, matching the API's "@toastcrumb/types is import-type-only /
 * runtime values are duplicated" policy (see reviews.service.ts). The `userId`
 * is not part of the payload — it comes from the route param.
 */
export interface QuizOutcomeInput {
  conceptId: string;
  lessonId: string;
  questionId: string;
  correct: boolean;
  isPretest: boolean;
  latencyMs: number | null;
  surface: "lesson" | "review" | "daily";
}

/** Whole-day diff between two instants on the UTC calendar (DST-safe). */
function utcDayDiff(from: Date, to: Date): number {
  const fromDay = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toDay - fromDay) / 86_400_000);
}

/**
 * Daily-streak rule (docs/GAME_LOOP.md), computed server-side on the UTC
 * calendar day — never on the client (server is the source of truth and this
 * blocks client-clock tampering). No punishment: a gap silently resets to 1.
 *
 *   null lastActiveDate (never) → 1
 *   same UTC day as now         → prevStreak (already counted today)
 *   exactly 1 UTC day earlier   → prevStreak + 1
 *   ≥ 2 UTC days earlier        → 1 (reset)
 */
export function nextStreak(
  prevStreak: number,
  lastActiveDate: Date | null,
  now: Date,
): number {
  if (lastActiveDate == null) return 1;
  const days = utcDayDiff(lastActiveDate, now);
  if (days <= 0) return prevStreak; // same day (or clock skew): unchanged
  if (days === 1) return Math.max(prevStreak, 0) + 1; // consecutive day: +1
  return 1; // gap of 2+ days: silent reset
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly reviews: ReviewsService,
  ) {}

  /** No signup required initially (docs/PRODUCT_RULES.md) — create an anonymous user. */
  create() {
    return this.prisma.user.create({ data: {} });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      // Never expose secrets via GET /api/users/:id (Story 7.1 AC 8/9).
      omit: { passwordHash: true, googleId: true },
    });
    if (!user) throw new NotFoundException(`user ${id} not found`);
    return user;
  }

  /**
   * Award XP for a completed lesson, recompute level/streak, and — when a
   * `conceptId` is supplied — record that concept as completed (Story 4.4).
   *
   * Single-writer of completion state: the denormalized `User` fields
   * (`completedConcepts`, `currentNode`) are written in the SAME `user.update`
   * that persists xp/level/streak (one User round-trip, as in 4.3); the granular
   * `Progress` row is upserted to 100% in a separate statement (different table).
   * `completedConcepts` is deduped from the already-read row — Prisma `push` is
   * an unconditional append, so a replay / Strict-Mode double-POST can't add the
   * id twice. With no `conceptId`, behaves exactly as before (XP/streak only).
   * The full updated `User` row is returned so the response already carries the
   * new completion state (the 4.2/4.3 "response carries state" pattern).
   */
  async awardLessonXp(id: string, correctQuizzes = 0, conceptId?: string) {
    const user = await this.get(id);
    const xp =
      user.xp + XP_PER_LESSON + correctQuizzes * XP_PER_CORRECT_QUIZ;
    const now = new Date();
    const streak = nextStreak(user.streak, user.lastActiveDate, now);

    const completion = conceptId
      ? {
          currentNode: conceptId,
          completedConcepts: user.completedConcepts.includes(conceptId)
            ? user.completedConcepts
            : [...user.completedConcepts, conceptId],
        }
      : {};

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        xp,
        level: levelForXp(xp),
        streak,
        lastActiveDate: now,
        ...completion,
      },
    });

    if (conceptId) {
      await this.progress.upsert(id, conceptId, 100);
      // Completing a lesson introduces the concept — seed its spaced-review
      // schedule (Story 9.1). Idempotent: a replay / double-POST keeps an
      // existing schedule (never resets it to New). Reuses the same `now` so
      // streak, progress and the first-review clock agree. Does not add a
      // second User write or change this method's return value (AC 6/7).
      await this.reviews.initForConcept(id, conceptId, now);
    }

    return updated;
  }

  /**
   * Record that the user completed today's daily session (Story 9.3) — a
   * STREAK-ONLY sibling of `awardLessonXp`. Writes ONLY `{ streak,
   * lastActiveDate }`; awards NO xp/level and writes NO completion
   * (`completedConcepts`/`currentNode`/`Progress`/`ReviewState` untouched).
   *
   * This is the path that keeps a **reviews-only day's streak alive** — the
   * daily goal is "complete your session," not "complete a new concept" (owner
   * Q2). It must never mint XP: a session's reviews are uncredited retrieval
   * practice, and XP === concept-graph mastery, never a farmable side-currency
   * (research/2026-07-04-learning-science.md:41).
   *
   * Same-day idempotent for free via `nextStreak` (same UTC day → streak
   * unchanged): calling it after a new-concept `completeLesson` already bumped
   * the streak today is a safe no-op, and a double-call in a day cannot
   * double-count. Returns the full updated row (response-carries-state, like
   * `awardLessonXp`) so the session's done screen can show the streak.
   */
  async markSessionComplete(id: string) {
    const user = await this.get(id);
    const now = new Date();
    const streak = nextStreak(user.streak, user.lastActiveDate, now);
    return this.prisma.user.update({
      where: { id },
      data: { streak, lastActiveDate: now },
    });
  }

  /**
   * Grade an in-session review's recall and feed it back to the FSRS
   * scheduler (Story 9.5). A thin delegate — this service never derives a
   * grade or touches FSRS internals itself; `ReviewsService.recordReviewOutcome`
   * owns that (single-writer discipline for `ReviewState`'s FSRS fields, the
   * narrow sibling to `awardLessonXp`'s XP/streak/completion writes). Mints NO
   * XP, bumps NO streak, writes NO `Progress` — see the crediting-model table
   * in Story 9.5's dev notes.
   */
  recordReview(
    id: string,
    conceptId: string,
    correctCount: number,
    totalCount: number,
  ) {
    return this.reviews.recordReviewOutcome(id, conceptId, correctCount, totalCount);
  }

  /**
   * Persist per-question difficulty telemetry (Story 10.5) — a narrow,
   * telemetry-ONLY single-writer (the sibling to `recordReview`'s FSRS-only
   * write). Writes `QuizOutcome` rows via `createMany`; mints NO XP, bumps NO
   * streak, writes NO `Progress`, computes NO FSRS grade. The client calls this
   * fire-and-forget, so a failure here (e.g. a stale userId FK) surfaces as a
   * non-ok response the caller's `.catch()` swallows — never affecting scoring
   * or flow. An empty batch is a no-op (a lesson with no answered quizzes).
   */
  async recordQuizOutcomes(id: string, outcomes: QuizOutcomeInput[]) {
    if (outcomes.length === 0) return { count: 0 };
    const result = await this.prisma.quizOutcome.createMany({
      data: outcomes.map((o) => ({ userId: id, ...o })),
    });
    return { count: result.count };
  }

  /**
   * Persist a batch of behavioral events (Story 14.2) — a generic, best-effort,
   * telemetry-ONLY single-writer, the behavioral sibling to `recordQuizOutcomes`.
   * Writes `Event` rows via `createMany`; mints NO XP, bumps NO streak, writes NO
   * `Progress`, computes NO FSRS grade. The web `track()` client flushes this
   * fire-and-forget, so a failure here (e.g. a stale userId FK) surfaces as a
   * non-ok response the client swallows — never affecting scoring or navigation
   * (the Story 10.5 boundary). An empty batch is a no-op.
   *
   * The controller validates `name` against the event catalog and each item's
   * shape; here we only shape the rows for Prisma. `props` is a `Json?` column:
   * an absent/null payload is passed as `undefined` so the column is omitted and
   * stored as SQL NULL (Prisma disallows a bare `null` for a Json field).
   */
  async recordEvents(id: string, events: EventInput[]) {
    if (events.length === 0) return { count: 0 };
    const result = await this.prisma.event.createMany({
      data: events.map((e) => ({
        userId: id,
        name: e.name,
        props: (e.props ?? undefined) as Prisma.InputJsonValue | undefined,
        surface: e.surface ?? undefined,
        sessionId: e.sessionId ?? undefined,
      })),
    });
    return { count: result.count };
  }

  /**
   * Fold an anonymous user's earned state into an account, then delete the
   * anonymous row (Story 7.4). Called once at sign-in, when the web app swaps
   * its anonymous `toastcrumb_user_id` for the account's DB id and would
   * otherwise abandon the guest's XP/streak/progress.
   *
   * Merge rules: xp = sum; streak = max; completedConcepts = deduped union;
   * level = recomputed from final xp; lastActiveDate = later non-null date;
   * currentNode = account's if set, else guest's; Progress rows merge per
   * conceptId keeping the higher completion and the later lastAccessed.
   *
   * All reads happen inside the interactive $transaction so that a concurrent
   * awardLessonXp on the anon row cannot mutate state between our snapshot and
   * the write (TOCTOU fix). deleteMany is used instead of delete so that a
   * concurrent second merge that already removed the anon row silently deletes
   * 0 rows rather than throwing P2025.
   *
   * Idempotent / defensive: a self-merge (anonId === accountId) or a missing
   * anon row is a no-op `{ merged: true }`; a missing account row is a 404.
   */
  async mergeInto(anonId: string, accountId: string) {
    // Self-merge (already-signed-in account re-running the flow): no-op.
    if (anonId === accountId) return { merged: true };

    await this.prisma.$transaction(async (tx) => {
      // Reads are inside the transaction to prevent a concurrent awardLessonXp
      // from mutating the anon row between our snapshot and the write.
      const anonUser = await tx.user.findUnique({
        where: { id: anonId },
        include: { progress: true, reviewStates: true },
      });
      // Anon already deleted (e.g. concurrent merge) — nothing to fold in.
      if (!anonUser) return;

      const accountUser = await tx.user.findUnique({
        where: { id: accountId },
        include: { progress: true },
      });
      if (!accountUser) {
        throw new NotFoundException(`user ${accountId} not found`);
      }

      const xp = anonUser.xp + accountUser.xp;
      const streak = Math.max(anonUser.streak, accountUser.streak);
      const completedConcepts = [
        ...new Set([
          ...accountUser.completedConcepts,
          ...anonUser.completedConcepts,
        ]),
      ];
      const level = levelForXp(xp);
      // Later of the two non-null dates (null only if both are null).
      const dates = [anonUser.lastActiveDate, accountUser.lastActiveDate].filter(
        (d): d is Date => d != null,
      );
      const lastActiveDate =
        dates.length === 0
          ? null
          : new Date(Math.max(...dates.map((d) => d.getTime())));
      // Keep the account's last graph position if set; otherwise inherit the guest's.
      const currentNode = accountUser.currentNode ?? anonUser.currentNode;

      // Map the account's existing Progress rows by conceptId so each anon row
      // can be folded in with max(completion) / later lastAccessed in one pass.
      const accountProgress = new Map(
        accountUser.progress.map((p) => [p.conceptId, p]),
      );

      await tx.user.update({
        where: { id: accountId },
        data: {
          xp,
          level,
          streak,
          lastActiveDate,
          completedConcepts,
          currentNode,
        },
      });

      for (const p of anonUser.progress) {
        const existing = accountProgress.get(p.conceptId);
        const completion = existing
          ? Math.max(existing.completion, p.completion)
          : p.completion;
        const lastAccessed =
          existing && existing.lastAccessed > p.lastAccessed
            ? existing.lastAccessed
            : p.lastAccessed;
        await tx.progress.upsert({
          where: {
            userId_conceptId: { userId: accountId, conceptId: p.conceptId },
          },
          create: {
            userId: accountId,
            conceptId: p.conceptId,
            completion,
            lastAccessed,
          },
          update: { completion, lastAccessed },
        });
      }

      // Fold in the anon user's review schedules (Story 9.1 AC 8). Same
      // (userId, conceptId) grain as Progress, but a different merge rule:
      // MOVE a schedule only for a concept the account has NO schedule for;
      // if the account already owns one, KEEP it (do not clobber a schedule
      // the account is mid-way through). The no-op `update: {}` expresses
      // "keep the account's row", and — like the progress upsert — makes a
      // concurrent double-merge idempotent instead of throwing on the unique
      // constraint. Done inside this $transaction and BEFORE the anon delete,
      // otherwise the onDelete: Cascade would drop the guest's review schedule.
      for (const r of anonUser.reviewStates) {
        await tx.reviewState.upsert({
          where: {
            userId_conceptId: { userId: accountId, conceptId: r.conceptId },
          },
          create: {
            userId: accountId,
            conceptId: r.conceptId,
            stability: r.stability,
            difficulty: r.difficulty,
            due: r.due,
            lastReview: r.lastReview,
            reps: r.reps,
            lapses: r.lapses,
            state: r.state,
            elapsedDays: r.elapsedDays,
            scheduledDays: r.scheduledDays,
            learningSteps: r.learningSteps,
            // Variant-rotation bookkeeping (Story 9.2). This create payload
            // enumerates columns explicitly (not a spread), so lastVariantId
            // must be listed here or the guest's rotation position would reset
            // to null when a schedule moves to an account lacking one.
            lastVariantId: r.lastVariantId,
          },
          update: {}, // account already has a schedule for this concept: keep it
        });
      }

      // deleteMany is idempotent: if the anon row was concurrently deleted
      // between this transaction's read and here, it removes 0 rows instead
      // of throwing P2025. Cascade removes the anon Progress and ReviewState
      // rows (schema.prisma: Progress.user / ReviewState.user onDelete: Cascade) —
      // ReviewState rows are already folded in above, so this is safe.
      await tx.user.deleteMany({ where: { id: anonId } });
    });

    return { merged: true };
  }
}
