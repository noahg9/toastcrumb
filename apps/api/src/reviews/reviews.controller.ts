import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
} from "@nestjs/common";
import { ReviewsService } from "./reviews.service";

/**
 * First controller for the spaced-review loop (Story 9.2 — Story 9.1 built the
 * service with no HTTP surface). Read + record the variant most recently served
 * as a review, so the web can rotate through a concept's dormant lesson variants
 * instead of re-showing an identical question. Deliberately mirrors
 * ProgressController's route shape: `@Controller("users/:userId/...")`, plain
 * `@Body`, no DTO/ValidationPipe (matching the codebase's existing pattern;
 * input-validation hardening is a documented deferred gap, not this story).
 *
 * No FSRS mutation and no grading endpoint here — a review in 9.2 is uncredited
 * and ungraded (grading → 9.5, session composition → 9.3).
 */
@Controller("users/:userId/reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // Collection root: the user's currently-due review rows (Story 9.3 — the read
  // the daily-session composer consumes). Returns `[]` (not a 404) when nothing
  // is due. Distinct from `@Get(":conceptId")` below — Nest routes the bare
  // collection path and the parameterized path without collision.
  //
  // `?scope=all` (Story 9.6) widens this to ALL of the user's review rows for the
  // graph mastery visualisation; any other value (including absent) returns the
  // due subset exactly as before — the session composer depends on the default.
  @Get()
  list(@Param("userId") userId: string, @Query("scope") scope?: string) {
    return scope === "all"
      ? this.reviews.listAllForUser(userId)
      : this.reviews.listDueForUser(userId);
  }

  // Returns the ReviewState row for (userId, conceptId), or `null` when no row
  // exists yet — the web reads `lastVariantId` and treats a missing row as
  // "never introduced / never reviewed" (lastVariantId = null) without erroring.
  @Get(":conceptId")
  get(@Param("userId") userId: string, @Param("conceptId") conceptId: string) {
    return this.reviews.getForConcept(userId, conceptId);
  }

  // Records the variant just served (`lastVariantId`). Writes only that column.
  @Put(":conceptId")
  record(
    @Param("userId") userId: string,
    @Param("conceptId") conceptId: string,
    @Body() body: { lastVariantId: string },
  ) {
    if (typeof body?.lastVariantId !== "string" || !body.lastVariantId) {
      throw new BadRequestException("lastVariantId is required");
    }
    return this.reviews.recordVariantSeen(userId, conceptId, body.lastVariantId);
  }
}
