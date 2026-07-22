// apps/web/lib/session.ts — PURE, no I/O.
//
// The daily-session composer (Story 9.3): given the one new concept the user
// should learn next and the concepts currently due for review, produce the
// ordered plan for today's bounded session — one new concept (worked-example
// first) followed by 3–5 spaced reviews of older concepts, then a hard stop.
//
// Pure transform (no clock, no fetch, no unlock computation inside) — mirrors
// lib/review.ts's posture so it is trivially unit-verifiable. The caller derives
// the "one new concept" id (via lib/unlock.ts `deriveUnlockState`, exactly as
// ConceptSkillTree does) and fetches the due rows (via listDueReviews); this
// module only shapes those inputs into the play order.
//
// SessionPlan is a web-only derived view (like DailyChallenge / the graph view),
// so it lives here rather than in @toastcrumb/types — the API never needs it
// (session composition runs web-side; the API only supplies conceptIds).

export interface SessionPlan {
  /** The one new concept to learn (worked-example variant), or null when none is available. */
  newConceptId: string | null;
  /** Ordered review conceptIds — confusability-clustered, anchor-first, capped, excluding `newConceptId`. */
  reviewConceptIds: string[];
}

/**
 * Compose the daily session plan. Deterministic:
 *
 *   - `newConceptId` = the caller-derived recommended new concept (or null);
 *   - `reviewConceptIds` = the due conceptIds, defensively excluding
 *     `newConceptId` (a concept must never appear as a review inside the same
 *     session that introduces it), then **confusability-ordered** and capped at
 *     `max` (default 5).
 *
 * Confusable-neighbor interleaving (Story 9.4): interleaving's evidence is
 * strongest for discriminating *confusable* concepts, and the schedule is frozen
 * until 9.5 (every completed concept stays due, so the due list routinely
 * exceeds `max`). So this composer both **selects** and **orders** by
 * confusability. Given `confusableById` (conceptId → confusable neighbor ids,
 * derived by the caller from the graph), it:
 *
 *   1. groups the candidate reviews into confusable clusters (connected
 *      components under the confusable relation, restricted to the candidates);
 *   2. flags anchor clusters — those containing a confusable neighbor of the new
 *      concept (learn X → immediately review its confusable partner);
 *   3. orders clusters by (isAnchor desc, size desc, minDueIndex asc) — anchors
 *      lead, then confusable-rich clusters win slots over unrelated singletons;
 *   4. orders members within a cluster by due order;
 *   5. flattens and slices to `max`.
 *
 * Every ordering key is total (dueIndex is unique), so the result is fully
 * deterministic — no clock, no randomness. **Graceful degrade:** when no
 * candidate is confusable with any other and none neighbors the new concept,
 * every cluster is a singleton and the key collapses to due order → the output
 * is byte-identical to a plain `filter(exclude-new).slice(0, max)` (9.3's
 * behavior), so interleaving never regresses the no-op case.
 *
 * Pure: the caller passes `confusableById` already derived; this module builds
 * no graph, reads no content, calls no clock. `max` is a soft target (3–5 is the
 * research spec) — fewer due reviews is valid. The new concept still plays first.
 */
export function composeSession({
  recommendedNewConceptId,
  dueReviewConceptIds,
  confusableById = {},
  max = 5,
}: {
  recommendedNewConceptId: string | null;
  dueReviewConceptIds: string[];
  confusableById?: Record<string, string[]>;
  max?: number;
}): SessionPlan {
  const newConceptId = recommendedNewConceptId ?? null;

  // Candidate reviews in due order (input order), never the just-introduced concept.
  const candidates = dueReviewConceptIds.filter((id) => id !== newConceptId);
  const dueIndex = new Map(candidates.map((id, i) => [id, i]));
  const candidateSet = new Set(candidates);

  // Confusable neighbors of `x` that are themselves candidates (the relation
  // restricted to the due set). `confusableById` is symmetric by construction
  // (see confusableNeighbors), so components are well-defined.
  const linksWithin = (x: string): string[] =>
    (confusableById[x] ?? []).filter((n) => candidateSet.has(n));

  // Connected components via BFS, seeding in due order for determinism.
  const seen = new Set<string>();
  const clusters: string[][] = [];
  for (const start of candidates) {
    if (seen.has(start)) continue;
    const cluster: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const cur = queue.shift() as string;
      cluster.push(cur);
      for (const n of linksWithin(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    clusters.push(cluster);
  }

  // A cluster anchors if it contains a confusable neighbor of the new concept.
  const newConfusable = new Set(newConceptId ? (confusableById[newConceptId] ?? []) : []);
  // Every cluster member came from `candidates`, so it always has a dueIndex entry.
  const minDueIndex = (cluster: string[]) =>
    Math.min(...cluster.map((id) => dueIndex.get(id)!));

  const ranked = clusters
    .map((cluster) => ({
      // Within a cluster, members follow due order.
      members: [...cluster].sort((a, b) => dueIndex.get(a)! - dueIndex.get(b)!),
      isAnchor: cluster.some((id) => newConfusable.has(id)),
      minDueIndex: minDueIndex(cluster),
    }))
    .sort(
      (a, b) =>
        Number(b.isAnchor) - Number(a.isAnchor) || // anchors first
        b.members.length - a.members.length || // then confusable-rich clusters
        a.minDueIndex - b.minDueIndex, // then earliest-due (total tie-break)
    );

  const reviewConceptIds = ranked.flatMap((c) => c.members).slice(0, max);
  return { newConceptId, reviewConceptIds };
}
