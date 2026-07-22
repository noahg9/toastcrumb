"use client";

// The daily session (Story 9.3): one bounded run of a single new concept
// (credited, worked-example-first) followed by 3–5 spaced reviews of older
// concepts (uncredited — no XP/streak/Progress — but FSRS-graded since Story
// 9.5), then a hard stop for the day.
//
// Composition is split per the static/dynamic boundary (docs/ARCHITECTURE.md):
// the API supplies which concepts are due (dynamic ReviewState); this client
// supplies the graph + lesson/quiz content (static /content). The composer and
// both players run web-side; the API never reads /content.
//
// Crediting (the anti-farming spine):
//   • New-concept lesson  → XP + streak + progress + FSRS seed, via the EXISTING
//     completeLesson path (LessonPlayer, reused verbatim with a Continue override).
//   • Reviews             → ZERO XP, no Progress, no lesson-complete, but DOES
//     grade the FSRS schedule (Story 9.5: recordReview, once per reviewed
//     concept) — the crediting spine (no XP/streak/Progress) is unchanged;
//     only the schedule advances.
//   • Session complete    → streak-only bump (markSessionComplete), so a
//     reviews-only day keeps the streak alive without minting any XP.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { questionId } from "@toastcrumb/types";
import type {
  Concept,
  QuizCard as QuizCardType,
  QuizOutcome,
  ReviewState,
  User,
} from "@toastcrumb/types";
import {
  completeSession,
  createUser,
  getAllReviews,
  getStoredUserId,
  getUser,
  listDueReviews,
  recordQuizOutcomes,
  recordReview,
  recordReviewVariant,
  setStoredUserId,
} from "@/lib/api";
import { track } from "@/lib/analytics";
import { confusableNeighbors, type ConceptGraph } from "@/lib/graph";
import { deriveUnlockState } from "@/lib/unlock";
import { composeSession, type SessionPlan } from "@/lib/session";
import { selectReviewVariant, reviewQuizCards } from "@/lib/review";
import { QuizCard } from "@/components/QuizCard";
import { LessonPlayer } from "@/app/lesson/[conceptId]/LessonPlayer";
import { MapShell } from "@/components/MapShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Research spec: 3–5 reviews. Soft cap — fewer is fine (see composeSession).
const SESSION_MAX = 5;

// UTC calendar-day key for the once-per-day "done for today" lock. Computed
// client-side at load AND at completion time (never from a server-frozen `now`)
// to avoid UTC-midnight-crossing staleness (deferred-work.md 8.4). Reuses the
// daily.ts:challengeDateKey idiom (toISOString().slice(0,10)) — not the module,
// which is server-only (node:fs via content.ts).
function sessionDoneKey(now: Date = new Date()): string {
  return `toastcrumb_session_${now.toISOString().slice(0, 10)}`;
}

type Phase = "loading" | "new" | "reviews" | "complete" | "done-today";

// ─── One review concept: play its dormant-variant quiz cards, uncredited ──────
// Lifts /review's core loop inline (Story 9.3 Reuse map sanctions this) so the
// session flows concept→concept under one progress rail with no interstitial
// per-concept "review complete" screen. Reuses the SAME pure primitives as
// ReviewPlayer (selectReviewVariant + reviewQuizCards + QuizCard) and the same
// record-on-serve write. Adds NO XP/streak/Progress crediting. When `graded` it
// also advances the FSRS schedule once per reviewed concept (Story 9.5) — set
// for genuinely-due reviews and cleared for the caught-up extra-practice
// fallback, which (like `/review/[conceptId]`) must stay ungraded.
function ReviewStep({
  concept,
  lastVariantId,
  userId,
  stepLabel,
  graded,
  onDone,
  onPlayed,
}: {
  concept: Concept;
  lastVariantId: string | null;
  userId: string;
  stepLabel: string;
  /** True for genuinely-due reviews (grade FSRS); false for extra practice, which
      plays the same cards but must NOT advance the schedule. */
  graded: boolean;
  onDone: () => void;
  /** Fired once this step actually serves a real quiz card (not the malformed-variant skip). */
  onPlayed: () => void;
}) {
  const [cards, setCards] = useState<QuizCardType[]>([]);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  // Guards the one-time select + record-on-serve against React StrictMode's
  // double-invoke, keyed on concept.id (this component is also remounted per
  // concept via a `key`, so the guard only has to cover a single mount).
  const startedRef = useRef<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onPlayedRef = useRef(onPlayed);
  onPlayedRef.current = onPlayed;
  // Correctness across the review's cards so far (not counting the current
  // card, which `advance` folds in when it fires). A plain ref, not
  // `setState` — QuizCard latches its Continue button so `onAnswered`/`advance`
  // fires at most once per card, so a synchronous increment is race-free.
  const correctSoFarRef = useRef(0);
  // Story 10.5 — per-question difficulty telemetry for the review surface. The
  // served variant's /content lesson id (for the QuizOutcome.lessonId) and the
  // accumulated outcomes, POSTed fire-and-forget on the review's last card
  // (same boundary as the 9.5 grading call). Telemetry only — no XP/streak/FSRS.
  const variantIdRef = useRef<string | null>(null);
  const outcomesRef = useRef<QuizOutcome[]>([]);

  useEffect(() => {
    if (startedRef.current === concept.id) return;
    startedRef.current = concept.id;

    const variant = selectReviewVariant(concept.lessons, lastVariantId);
    variantIdRef.current = variant.id;
    const quizCards = reviewQuizCards(variant);

    // Malformed variant with zero quiz cards → skip this concept rather than
    // dead-end the session (real content always has ≥2 quiz cards per variant).
    // Not counted as "played" — see onPlayed — so an all-skipped session
    // doesn't falsely credit the streak.
    if (quizCards.length === 0) {
      console.error(
        `ReviewStep: skipping concept "${concept.id}" — resolved variant has 0 quiz cards`,
      );
      onDoneRef.current();
      return;
    }

    setCards(quizCards);
    setIndex(0);
    setReady(true);
    onPlayedRef.current();

    // Record-on-serve: advance rotation immediately, even if abandoned. Writes
    // ONLY lastVariantId server-side (no XP/streak/Progress/FSRS grade).
    recordReviewVariant(userId, concept.id, variant.id).catch((err) =>
      console.error("recordReviewVariant failed", err),
    );
  }, [concept, lastVariantId, userId]);

  // Grades once, when the review's LAST card is answered (Story 9.5) — fires
  // recordReview fire-and-forget (same best-effort idiom as the
  // record-on-serve recordReviewVariant call above), then advances/finishes.
  // Uses `index` from this render's closure directly (not setIndex's
  // functional updater) — advance fires once per Continue click and this
  // component remounts per concept (key={concept.id} at the call site), so a
  // plain closure read is race-free and keeps the correctness increment out
  // of setState's updater entirely.
  const advance = (correct: boolean, latencyMs: number) => {
    // Story 10.5: capture this review question's difficulty outcome. Review
    // cards are never pretests (reviewQuizCards filters them out), but read the
    // flag defensively so a future change can't silently mislabel the band.
    const card = cards[index];
    outcomesRef.current.push({
      conceptId: concept.id,
      lessonId: variantIdRef.current ?? concept.id,
      questionId: questionId(card.question),
      correct,
      isPretest: card.pretest === true,
      latencyMs,
      surface: "review",
    });
    const isLastCard = index + 1 >= cards.length;
    if (isLastCard) {
      // Grade FSRS only for genuinely-due reviews. Extra practice (the caught-up
      // fallback) plays the same cards but must leave the schedule untouched —
      // mirrors the permanently-ungraded /review/[conceptId] extra-practice
      // route, so re-practicing already-mastered content can't corrupt spacing.
      if (graded) {
        const correctCount = correctSoFarRef.current + (correct ? 1 : 0);
        recordReview(userId, concept.id, correctCount, cards.length).catch(
          (err) => console.error("recordReview failed", err),
        );
        // Story 14.2: behavioral record that a review was graded, SEPARATE from
        // the FSRS grade above (Decision 5). PII-free props (ids + counts).
        track(
          "review_graded",
          { conceptId: concept.id, correctCount, total: cards.length },
          "session",
        );
      }
      // Flush telemetry fire-and-forget, separately from the load-bearing FSRS
      // grade above — a telemetry failure must never affect the schedule/flow.
      recordQuizOutcomes(userId, outcomesRef.current).catch((err) =>
        console.error("recordQuizOutcomes failed", err),
      );
      onDoneRef.current();
      return;
    }
    correctSoFarRef.current += correct ? 1 : 0;
    setIndex(index + 1);
  };

  return (
    <SessionShell
      title={concept.title}
      counter={ready ? `${index + 1} / ${cards.length}` : "review"}
      progress={ready ? ((index + 1) / cards.length) * 100 : undefined}
    >
      {ready && (
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.2 }}
            className="w-full rounded-3xl p-8 lg:p-12 text-left flex flex-col lg:min-h-[280px]"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase mb-4 text-[var(--color-fg-muted)]">
              {stepLabel} · recall
            </p>
            {/* Full quiz card played inline by a known user (no spoiler strip).
                onAnswered's `correct` feeds the FSRS grade (Story 9.5) fired
                once, on the review's last card — still 0 XP/no streak/no
                Progress. */}
            <QuizCard card={cards[index]} onAnswered={advance} />
          </motion.div>
        </AnimatePresence>
      )}
    </SessionShell>
  );
}

// ─── Shared full-screen shell (header + optional progress bar) ────────────────
function SessionShell({
  title,
  counter,
  progress,
  children,
}: {
  title: string;
  counter: string;
  progress?: number;
  children: React.ReactNode;
}) {
  return (
    <MapShell>
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[600px] lg:max-w-[760px] flex-col">
        <header className="relative flex items-center justify-between px-5 py-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <Link href="/learn">← back</Link>
          </Button>
          <span
            className="absolute left-1/2 -translate-x-1/2 font-display font-semibold text-sm truncate max-w-[200px]"
            style={{ color: "var(--tc-ink)" }}
          >
            {title}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{counter}</span>
        </header>
        {progress !== undefined && (
          <Progress value={progress} className="h-[3px] rounded-none" />
        )}
        <div className="relative flex flex-1 items-center justify-center px-5 py-6 lg:py-10">
          {children}
        </div>
      </main>
    </MapShell>
  );
}

// ─── Resolved / done screens (hard-stop + uncredited extra practice) ──────────
function DoneScreen({
  eyebrow,
  heading,
  body,
  streak,
  extraPracticeConceptId,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  streak?: number;
  extraPracticeConceptId: string | null;
}) {
  return (
    <SessionShell title="Daily session" counter="done">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full rounded-3xl p-8 lg:p-12 text-center"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)] mb-3">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)] mb-3">
          {heading}
        </h1>
        <p className="text-[14px] leading-relaxed text-[var(--color-fg-muted)] mb-6">
          {body}
        </p>

        {typeof streak === "number" && streak >= 1 && (
          <motion.p
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, delay: 0.12 }}
            className="font-mono text-sm text-[var(--color-fg-muted)] mb-7"
          >
            🔥 {streak} day streak
          </motion.p>
        )}

        <div className="flex flex-col items-center gap-3">
          {extraPracticeConceptId && (
            <Button
              asChild
              variant="outline"
              className="rounded-full font-semibold px-8"
            >
              <Link href={`/review/${extraPracticeConceptId}`}>
                Extra practice →
              </Link>
            </Button>
          )}
          <Button asChild className="rounded-full font-bold px-10">
            <Link href="/learn">Back to skill tree</Link>
          </Button>
        </div>

        {extraPracticeConceptId && (
          <p className="mt-4 text-[11px] text-[var(--color-fg-muted-2)]">
            Extra practice keeps concepts fresh — jump in anytime, no pressure
            on XP or your streak.
          </p>
        )}
      </motion.div>
    </SessionShell>
  );
}

// ─── Main player ──────────────────────────────────────────────────────────────
export function SessionPlayer({
  graph,
  concepts,
}: {
  graph: ConceptGraph;
  concepts: Concept[];
}) {
  const conceptsById = useMemo(() => {
    const m: Record<string, Concept> = {};
    for (const c of concepts) m[c.id] = c;
    return m;
  }, [concepts]);

  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [variantByConcept, setVariantByConcept] = useState<
    Record<string, string | null>
  >({});
  const [reviewIndex, setReviewIndex] = useState(0);
  // Whether the current "reviews" phase grades FSRS. True for genuinely-due
  // reviews; false for the caught-up extra-practice fallback (schedule untouched).
  const [reviewsGraded, setReviewsGraded] = useState(true);
  // Carries the user row for the streak/completed display on the done screen.
  const [sessionUser, setSessionUser] = useState<User | null>(null);

  const bootRef = useRef(false);
  const completeRef = useRef(false);
  // Set once real work happens (the new-concept lesson is completed, or at
  // least one review actually serves a quiz card) — gates streak crediting so
  // an all-skipped/empty session (malformed content) can't bump the streak.
  const playedRef = useRef(false);

  // ── Bootstrap + compose-once (before completing anything) ──
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    (async () => {
      // 1. Bootstrap userId like LessonPlayer — a first-time visitor from the
      //    home CTA gets a user and a session that is just their first concept.
      let uid = getStoredUserId();
      if (!uid) {
        try {
          const u = await createUser();
          uid = u.id;
          setStoredUserId(uid);
        } catch (err) {
          console.error("createUser failed", err);
          // No user → can't compose a session. Never dead-end on a "nothing to
          // do" screen; send the user to the skill tree instead (Story: always
          // route into lessons or the tree, never an empty state).
          router.replace("/learn");
          return;
        }
      }
      setUserId(uid);

      // 2. Hard-stop: already completed today? Show the resolved state — do NOT
      //    compose or serve a fresh session.
      let doneToday = false;
      try {
        doneToday = localStorage.getItem(sessionDoneKey()) != null;
      } catch {
        /* private mode → treat as not done */
      }
      if (doneToday) {
        try {
          setSessionUser(await getUser(uid));
        } catch {
          /* best-effort: the resolved screen still renders without the streak */
        }
        setPhase("done-today");
        return;
      }

      // 3. Compose once, from the pre-completion snapshot.
      let completedConcepts: string[] = [];
      let currentNode: string | null = null;
      try {
        const user = await getUser(uid);
        completedConcepts = user.completedConcepts;
        currentNode = user.currentNode;
        setSessionUser(user);
      } catch (err) {
        console.error("getUser failed — composing from empty state", err);
      }

      const unlock = deriveUnlockState(graph, completedConcepts);
      const recommendedNewConceptId =
        currentNode && unlock.available.includes(currentNode)
          ? currentNode
          : (unlock.available[0] ?? null);

      let dueRows: ReviewState[] = [];
      try {
        dueRows = await listDueReviews(uid);
      } catch (err) {
        console.error("listDueReviews failed — session runs with no reviews", err);
      }
      // Defensive: only keep due concepts that exist in content with lessons.
      const dueKnown = dueRows.filter(
        (r) => conceptsById[r.conceptId]?.lessons.length,
      );

      // Confusability lookup for the relevant ids (due candidates + the new
      // concept), derived from the already-loaded static graph — no new I/O.
      // Feeds the composer's interleaving (Story 9.4); the API supplies which
      // concepts are due, the web supplies the graph adjacency. The extra-
      // practice fallback computes its own lookup on its cold path only, so a
      // normal session doesn't pay a traversal per completed concept every boot.
      const relevantIds = new Set([
        ...dueKnown.map((r) => r.conceptId),
        ...(recommendedNewConceptId ? [recommendedNewConceptId] : []),
      ]);
      const confusableById: Record<string, string[]> = {};
      for (const id of relevantIds) {
        confusableById[id] = confusableNeighbors(graph, id);
      }

      const composed = composeSession({
        recommendedNewConceptId,
        dueReviewConceptIds: dueKnown.map((r) => r.conceptId),
        confusableById,
        max: SESSION_MAX,
      });
      const vmap: Record<string, string | null> = {};
      for (const r of dueKnown) vmap[r.conceptId] = r.lastVariantId;

      setPlan(composed);
      setVariantByConcept(vmap);

      // 4. Pick the opening phase.
      const hasNew =
        composed.newConceptId != null &&
        (conceptsById[composed.newConceptId]?.lessons.length ?? 0) > 0;
      if (hasNew) {
        setPhase("new");
        return;
      }
      if (composed.reviewConceptIds.length > 0) {
        setPhase("reviews");
        return;
      }

      // Nothing new to learn and nothing due for review → never dead-end on a
      // "nothing to do" screen. Fall back to extra practice: a review session
      // over the concepts the user has already learned, so pressing Continue
      // always drops them straight into lessons. Like any reviews-only day this
      // mints no XP but keeps the streak alive and grades FSRS per concept.
      const practiceCandidates = completedConcepts.filter(
        (id) => conceptsById[id]?.lessons.length,
      );
      if (practiceCandidates.length > 0) {
        // Rotate variants off the user's FULL review history (the due subset is
        // empty here), so extra practice doesn't just re-show variant 0.
        const practiceVariants: Record<string, string | null> = {};
        try {
          for (const r of await getAllReviews(uid)) {
            practiceVariants[r.conceptId] = r.lastVariantId;
          }
        } catch (err) {
          console.error(
            "getAllReviews failed — extra practice uses default variants",
            err,
          );
        }
        // Confusability ordering for the practice set — computed only on this
        // cold path (see relevantIds note above), not on every session boot.
        const practiceConfusable: Record<string, string[]> = {};
        for (const id of practiceCandidates) {
          practiceConfusable[id] = confusableNeighbors(graph, id);
        }
        setPlan(
          composeSession({
            recommendedNewConceptId: null,
            dueReviewConceptIds: practiceCandidates,
            confusableById: practiceConfusable,
            max: SESSION_MAX,
          }),
        );
        setVariantByConcept(practiceVariants);
        // Extra practice must not touch the FSRS schedule (see ReviewStep).
        setReviewsGraded(false);
        setPhase("reviews");
        return;
      }

      // Truly nothing available (brand-new user with no unlocked concept, or
      // empty/malformed content) — route to the skill tree instead of a message.
      router.replace("/learn");
    })();
    // Runs exactly once (bootRef-guarded); graph/concepts are stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Story 14.2: session_start once, when the first active phase is entered
  // (new-concept or reviews). "done-today" / route-away paths are not a start.
  // Pure fire-and-forget telemetry — never affects composition or flow.
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (sessionStartedRef.current) return;
    if (phase === "new" || phase === "reviews") {
      sessionStartedRef.current = true;
      track(
        "session_start",
        {
          hasNew: phase === "new",
          reviews: plan?.reviewConceptIds.length ?? 0,
          graded: reviewsGraded,
        },
        "session",
      );
    }
  }, [phase, plan, reviewsGraded]);

  // ── Phase transitions ──
  const afterNewConcept = useCallback(() => {
    playedRef.current = true;
    setPhase((prev) => {
      if (prev !== "new") return prev;
      return plan && plan.reviewConceptIds.length > 0 ? "reviews" : "complete";
    });
  }, [plan]);

  const onReviewPlayed = useCallback(() => {
    playedRef.current = true;
  }, []);

  const advanceReview = useCallback(() => {
    if (!plan) return;
    setReviewIndex((i) => {
      const next = i + 1;
      if (next >= plan.reviewConceptIds.length) {
        setPhase("complete");
        return i;
      }
      return next;
    });
  }, [plan]);

  // ── Phase 3: streak-only session-complete, exactly once ──
  useEffect(() => {
    if (phase !== "complete" || !userId || completeRef.current) return;
    completeRef.current = true;

    // Every review resolved to a malformed (0-quiz-card) variant and there was
    // no new concept — nothing was actually played. Don't credit the streak or
    // lock the day; route to the skill tree rather than a "nothing to do" screen.
    if (!playedRef.current) {
      router.replace("/learn");
      return;
    }

    // Story 14.2: behavioral session end. SEPARATE from the streak-only
    // completeSession scoring call below (Decision 5) — never folded into it.
    track(
      "session_complete",
      { reviews: plan?.reviewConceptIds.length ?? 0 },
      "session",
    );

    completeSession(userId)
      .then((user) => {
        // Persist the done-for-today lock only once the streak credit has
        // actually landed — a failed call must not hard-lock the user out of
        // retrying today's session (client UTC day, per sessionDoneKey).
        try {
          localStorage.setItem(sessionDoneKey(), "1");
        } catch {
          /* private mode: hard-stop degrades to per-tab (acceptable) */
        }
        setSessionUser(user);
      })
      .catch((err) => console.error("completeSession failed", err));
    // No done-for-today lock is set on failure, so the day stays unlocked —
    // e.g. a page reload composes a fresh session and can still earn today's
    // streak credit rather than being silently hard-stopped for nothing.
  }, [phase, userId, router, plan]);

  // Most-recently-learned completed concept, offered as uncredited extra practice.
  const extraPracticeConceptId = useMemo(() => {
    const done = sessionUser?.completedConcepts ?? [];
    return done.length > 0 ? done[done.length - 1] : null;
  }, [sessionUser]);

  // ── Render by phase ──
  if (phase === "loading") {
    return (
      <SessionShell title="Daily session" counter="…">
        <p className="font-mono text-xs text-[var(--color-fg-muted)]">
          composing your session…
        </p>
      </SessionShell>
    );
  }

  if (phase === "new" && plan?.newConceptId) {
    const newConcept = conceptsById[plan.newConceptId];
    if (newConcept && newConcept.lessons.length > 0) {
      return (
        <LessonPlayer
          concept={newConcept}
          lesson={newConcept.lessons[0]}
          graph={graph}
          onContinue={afterNewConcept}
          telemetrySurface="session"
        />
      );
    }
  }

  if (phase === "reviews" && plan) {
    const conceptId = plan.reviewConceptIds[reviewIndex];
    const reviewConcept = conceptId ? conceptsById[conceptId] : undefined;
    if (reviewConcept && userId) {
      return (
        <ReviewStep
          key={conceptId}
          concept={reviewConcept}
          lastVariantId={variantByConcept[conceptId] ?? null}
          userId={userId}
          stepLabel={`Review ${reviewIndex + 1} of ${plan.reviewConceptIds.length}`}
          graded={reviewsGraded}
          onDone={advanceReview}
          onPlayed={onReviewPlayed}
        />
      );
    }
  }

  if (phase === "done-today") {
    return (
      <DoneScreen
        eyebrow="Done for today"
        heading="Come back tomorrow"
        body="You've finished today's session. Spacing your practice across days is what makes it stick — a fresh session unlocks tomorrow."
        streak={sessionUser?.streak}
        extraPracticeConceptId={extraPracticeConceptId}
      />
    );
  }

  // phase === "complete"
  return (
    <DoneScreen
      eyebrow="Session complete"
      heading="Nice — that's today's session"
      body="One session a day is the whole game. Come back tomorrow to keep the streak going."
      streak={sessionUser?.streak}
      extraPracticeConceptId={extraPracticeConceptId}
    />
  );
}
