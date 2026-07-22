import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from "@nestjs/common";
import {
  EVENT_NAMES,
  MAX_EVENTS_BATCH,
  type EventInput,
} from "@toastcrumb/types";
import { UsersService, type QuizOutcomeInput } from "./users.service";

const QUIZ_SURFACES = new Set(["lesson", "review", "daily"]);
// Defensive cap on a single quiz-outcomes batch — every real surface caps at
// MAX_CARDS_PER_LESSON (16) quiz cards; this is a generous multiple of that.
const MAX_QUIZ_OUTCOMES_BATCH = 100;

// Runtime allow-list of behavioral event names (Story 14.2) — built from the
// shared EVENT_NAMES catalog in @toastcrumb/types, the single source of truth
// (Decision 4 / AC2). A name not in it is rejected so typos never create a
// phantom event stream, and a future catalog change is picked up here for free.
const EVENT_NAME_SET = new Set<string>(EVENT_NAMES);
// Generous caps on a single event's freeform fields (Story 14.2 review
// hardening) — ingest is unauthenticated (V1 posture), so these bound how much
// storage an unauthenticated flood of oversized payloads can consume per event.
// Real call sites only ever send small PII-free bags (ids/indices/booleans).
const MAX_PROPS_BYTES = 4_096;
const MAX_SURFACE_LEN = 100;
const MAX_SESSION_ID_LEN = 100;

// Manual per-item validation for the events batch (Story 14.2), mirroring
// parseQuizOutcome's BadRequestException style — no DTO/ValidationPipe, per the
// codebase norm. Guards DB integrity (name in the catalog; props is a JSON
// object when present, within a size cap; surface/sessionId are strings within
// a length cap) even though the client calls fire-and-forget. props stays a
// generic bag — never inspected for PII here; that contract is enforced at the
// call sites.
function parseEvent(o: unknown, i: number): EventInput {
  if (typeof o !== "object" || o === null) {
    throw new BadRequestException(`events[${i}] must be an object`);
  }
  const r = o as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name) {
    throw new BadRequestException(`events[${i}].name must be a non-empty string`);
  }
  if (!EVENT_NAME_SET.has(r.name)) {
    throw new BadRequestException(`events[${i}].name '${r.name}' is not a known event`);
  }
  let props: Record<string, unknown> | undefined;
  if (r.props !== undefined && r.props !== null) {
    if (typeof r.props !== "object" || Array.isArray(r.props)) {
      throw new BadRequestException(`events[${i}].props must be an object`);
    }
    if (JSON.stringify(r.props).length > MAX_PROPS_BYTES) {
      throw new BadRequestException(
        `events[${i}].props exceeds ${MAX_PROPS_BYTES} bytes`,
      );
    }
    props = r.props as Record<string, unknown>;
  }
  for (const [k, maxLen] of [
    ["surface", MAX_SURFACE_LEN],
    ["sessionId", MAX_SESSION_ID_LEN],
  ] as const) {
    if (r[k] === undefined || r[k] === null) continue;
    if (typeof r[k] !== "string") {
      throw new BadRequestException(`events[${i}].${k} must be a string`);
    }
    if ((r[k] as string).length > maxLen) {
      throw new BadRequestException(
        `events[${i}].${k} exceeds ${maxLen} characters`,
      );
    }
  }
  return {
    name: r.name as EventInput["name"],
    props,
    surface: (r.surface as string | undefined) ?? undefined,
    sessionId: (r.sessionId as string | undefined) ?? undefined,
  };
}

// Manual per-item validation for the quiz-outcomes batch (Story 10.5), matching
// the review endpoint's BadRequestException style — no DTO/ValidationPipe, per
// the codebase norm. Guards DB integrity (types + surface enum + non-negative
// latency) even though the client calls fire-and-forget.
function parseQuizOutcome(o: unknown, i: number): QuizOutcomeInput {
  if (typeof o !== "object" || o === null) {
    throw new BadRequestException(`outcomes[${i}] must be an object`);
  }
  const r = o as Record<string, unknown>;
  for (const k of ["conceptId", "lessonId", "questionId", "surface"] as const) {
    if (typeof r[k] !== "string" || !(r[k] as string)) {
      throw new BadRequestException(
        `outcomes[${i}].${k} must be a non-empty string`,
      );
    }
  }
  if (!QUIZ_SURFACES.has(r.surface as string)) {
    throw new BadRequestException(
      `outcomes[${i}].surface must be one of lesson|review|daily`,
    );
  }
  if (typeof r.correct !== "boolean") {
    throw new BadRequestException(`outcomes[${i}].correct must be a boolean`);
  }
  if (typeof r.isPretest !== "boolean") {
    throw new BadRequestException(`outcomes[${i}].isPretest must be a boolean`);
  }
  let latencyMs: number | null = null;
  if (r.latencyMs !== undefined && r.latencyMs !== null) {
    if (!Number.isInteger(r.latencyMs) || (r.latencyMs as number) < 0) {
      throw new BadRequestException(
        `outcomes[${i}].latencyMs must be a non-negative integer`,
      );
    }
    latencyMs = r.latencyMs as number;
  }
  return {
    conceptId: r.conceptId as string,
    lessonId: r.lessonId as string,
    questionId: r.questionId as string,
    correct: r.correct,
    isPretest: r.isPretest,
    latencyMs,
    surface: r.surface as QuizOutcomeInput["surface"],
  };
}

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create() {
    return this.users.create();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Post(":id/lesson-complete")
  completeLesson(
    @Param("id") id: string,
    @Body() body: { correctQuizzes?: number; conceptId?: string },
  ) {
    return this.users.awardLessonXp(id, body?.correctQuizzes ?? 0, body?.conceptId);
  }

  // Mark today's daily session complete (Story 9.3) — streak-only, no XP/no
  // completion. Keeps a reviews-only day's streak alive (owner Q2). 2-segment
  // path mirrors lesson-complete; no collision with the 3-segment merge-into.
  @Post(":id/session-complete")
  completeSession(@Param("id") id: string) {
    return this.users.markSessionComplete(id);
  }

  // Grade an in-session review's recall, feeding it back to the FSRS
  // scheduler (Story 9.5). Sibling of lesson-complete/session-complete (same
  // 2-segment path shape); no collision with the 3-segment merge-into or
  // ReviewsController's users/:userId/reviews/... paths. Manual body
  // validation mirrors ReviewsController.record's BadRequestException style
  // (Story 9.2) — no DTO/ValidationPipe.
  @Post(":id/review")
  review(
    @Param("id") id: string,
    @Body() body: { conceptId?: string; correctCount?: number; totalCount?: number },
  ) {
    if (typeof body?.conceptId !== "string" || !body.conceptId) {
      throw new BadRequestException("conceptId is required");
    }
    if (!Number.isInteger(body?.totalCount) || (body.totalCount as number) <= 0) {
      throw new BadRequestException("totalCount must be a positive integer");
    }
    if (
      !Number.isInteger(body?.correctCount) ||
      (body.correctCount as number) < 0 ||
      (body.correctCount as number) > (body.totalCount as number)
    ) {
      throw new BadRequestException(
        "correctCount must be an integer in [0, totalCount]",
      );
    }
    return this.users.recordReview(
      id,
      body.conceptId,
      body.correctCount as number,
      body.totalCount as number,
    );
  }

  // Record per-question difficulty telemetry (Story 10.5). Sibling of
  // lesson-complete/session-complete/review (same 2-segment path shape; no
  // collision with the 3-segment merge-into or ReviewsController's routes).
  // Accepts a batch `{ outcomes: [...] }` and writes QuizOutcome rows ONLY — no
  // XP/streak/Progress/FSRS grade. Manual body validation mirrors the review
  // endpoint (no DTO/ValidationPipe).
  @Post(":id/quiz-outcomes")
  recordQuizOutcomes(
    @Param("id") id: string,
    @Body() body: { outcomes?: unknown },
  ) {
    if (!Array.isArray(body?.outcomes)) {
      throw new BadRequestException("outcomes must be an array");
    }
    if (body.outcomes.length > MAX_QUIZ_OUTCOMES_BATCH) {
      throw new BadRequestException(
        `outcomes must not exceed ${MAX_QUIZ_OUTCOMES_BATCH} items`,
      );
    }
    const outcomes = body.outcomes.map((o, i) => parseQuizOutcome(o, i));
    return this.users.recordQuizOutcomes(id, outcomes);
  }

  // Ingest a batch of behavioral events (Story 14.2). Sibling of quiz-outcomes
  // (same 2-segment `:id/...` path shape; no collision with the 3-segment
  // merge-into or ReviewsController's routes). Accepts `{ events: [...] }` and
  // writes Event rows ONLY — no XP/streak/Progress/FSRS grade. Unauthenticated,
  // matching the V1 posture of every other /users/:id route (the guard lives on
  // the consumption side, Story 14.3). Manual body validation mirrors
  // quiz-outcomes (no DTO/ValidationPipe).
  @Post(":id/events")
  recordEvents(@Param("id") id: string, @Body() body: { events?: unknown }) {
    if (!Array.isArray(body?.events)) {
      throw new BadRequestException("events must be an array");
    }
    if (body.events.length > MAX_EVENTS_BATCH) {
      throw new BadRequestException(
        `events must not exceed ${MAX_EVENTS_BATCH} items`,
      );
    }
    const events = body.events.map((e, i) => parseEvent(e, i));
    return this.users.recordEvents(id, events);
  }

  // Fold an anonymous guest's state into an account at sign-in (Story 7.4).
  // Distinct 3-segment path shape (vs lesson-complete's 2 segments), so no
  // route collision. Unauthenticated for V1 (consistent with 7.1–7.3).
  @Post(":anonId/merge-into/:accountId")
  mergeInto(
    @Param("anonId") anonId: string,
    @Param("accountId") accountId: string,
  ) {
    return this.users.mergeInto(anonId, accountId);
  }
}
