// apps/web/lib/review.ts — PURE, no I/O.
//
// Variant selection + quiz projection for the spaced-review loop (Story 9.2).
// A concept's pipeline generates 2–3 lesson variants but the first-learn flow
// only ever plays lessons[0]; the dormant variants are ready-made review
// material. Reviews rotate through the OTHER variants so retrieval practice
// tests memory instead of re-showing an identical, pattern-matchable question.
//
// Both exports are pure transforms (no clock, no fetch, no user-state read) so
// they are trivially verifiable and reusable by the 9.3 session composer. The
// last-variant-seen memory is dynamic user state and lives behind the API
// (ReviewState.lastVariantId), NOT here — this module only maps content → the
// next variant to serve. Mirrors lib/daily.ts's sort-by-orderIndex + quiz-filter
// idiom; the API never reads /content, so selection stays web-side.
import type { Lesson, QuizCard } from "@toastcrumb/types";

/**
 * Pick the next variant to serve as a review, given the concept's lesson
 * variants and the variant this user last saw (`lastVariantId`, the /content
 * lesson id — or null if never reviewed). Deterministic:
 *
 *   - sorts variants by `orderIndex` ascending (getConcept does NOT sort file
 *     order — mirror buildDailyPool and sort here);
 *   - returns the variant immediately AFTER the last-seen one, cycling to the
 *     first when the last-seen was the final variant;
 *   - null / unknown lastVariantId → the first variant (the worked-example one);
 *   - a single-variant concept (5 of 20 today) → that sole variant. The
 *     "never identical" guarantee necessarily relaxes here; this is documented,
 *     acceptable degradation and must not error.
 *
 * Assumes `lessons` is non-empty (the /review route guards `lessons.length === 0`
 * via notFound() before this is reached).
 */
export function selectReviewVariant(
  lessons: Lesson[],
  lastVariantId: string | null,
): Lesson {
  const sorted = [...lessons].sort((a, b) => a.orderIndex - b.orderIndex);
  if (sorted.length <= 1) return sorted[0]; // single-variant: reuse the sole one
  const i = sorted.findIndex((l) => l.id === lastVariantId);
  if (i === -1) return sorted[0]; // never seen / stale id → first
  return sorted[(i + 1) % sorted.length]; // next, cycling
}

/**
 * Project a variant into its review payload: the checking quiz cards only, in
 * card order. A review = retrieval practice = the quiz beats, not the expository
 * context/insight/reward beats. Pretests (Story 10.1) are EXCLUDED — a pretest
 * is a prediction meant to be answered before the concept is taught, so serving
 * it out-of-context as a standalone review (and grading it into FSRS) would be
 * wrong; only the real checking quizzes are retrieval practice. Every real
 * variant has ≥2 checking quiz cards, so this is non-empty for real content; a
 * malformed variant yielding zero cards must be handled gracefully by the route
 * (empty/skip state), not crash.
 */
export function reviewQuizCards(lesson: Lesson): QuizCard[] {
  return (lesson.cards ?? []).filter(
    (c): c is QuizCard => c.type === "quiz" && !c.pretest,
  );
}
