"use client";

// Plays a spaced review of one concept (Story 9.2): picks a not-recently-seen
// lesson variant, projects its quiz cards, and plays them by REUSING the
// account-free QuizCard component (Story 8.2's extraction — its third consumer).
//
// A review here is UNCREDITED and UNGRADED (AC 7): it awards no XP/streak, writes
// no Progress, calls no lesson-complete, and applies no FSRS grade. It only reads
// `lastVariantId` and records the variant it served (record-on-serve, so rotation
// advances even if the review is abandoned). Crediting → 9.3, FSRS grading → 9.5.
//
// Content (variants, quiz cards) is static and arrives server-side via the parent
// route; the last-variant-seen memory is dynamic user state fetched from the API.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { Concept, QuizCard as QuizCardType } from "@toastcrumb/types";
import { getReviewState, getStoredUserId, recordReviewVariant } from "@/lib/api";
import { selectReviewVariant, reviewQuizCards } from "@/lib/review";
import { QuizCard } from "@/components/QuizCard";
import { MapShell } from "@/components/MapShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Status = "loading" | "no-user" | "empty" | "playing" | "done";

export function ReviewPlayer({ concept }: { concept: Concept }) {
  const [status, setStatus] = useState<Status>("loading");
  const [cards, setCards] = useState<QuizCardType[]>([]);
  const [index, setIndex] = useState(0);
  // Guards the one-time load+record per concept so React StrictMode's
  // double-invoke (and any re-render) can't select/record twice — keyed on
  // concept.id (not a bare boolean) so a client-side nav to a different
  // /review/:conceptId re-runs this effect for the new concept.
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (startedRef.current === concept.id) return;
    startedRef.current = concept.id;
    setStatus("loading");
    setCards([]);
    setIndex(0);

    const userId = getStoredUserId();
    // A review presupposes an introduced concept, which presupposes a user. No
    // user → nothing to review; do NOT create one (that's the learn flow's job).
    if (!userId) {
      setStatus("no-user");
      return;
    }

    const uid = userId;
    (async () => {
      // Read the last-served variant; degrade to null (serve the first variant)
      // if the row is missing or the fetch fails — a review must still play.
      let lastVariantId: string | null = null;
      try {
        const row = await getReviewState(uid, concept.id);
        lastVariantId = row?.lastVariantId ?? null;
      } catch (err) {
        console.error("getReviewState failed", err);
        lastVariantId = null;
      }

      const variant = selectReviewVariant(concept.lessons, lastVariantId);
      const quizCards = reviewQuizCards(variant);

      // Malformed variant with zero quiz cards → graceful empty state, no crash.
      if (quizCards.length === 0) {
        setStatus("empty");
        return;
      }

      setCards(quizCards);
      setStatus("playing");

      // Record-on-serve: advance rotation immediately, even if abandoned. Writes
      // only lastVariantId server-side; swallow failures (a review is best-effort
      // and uncredited — never block play on this write), but log so a failing
      // rotation-advance write isn't invisible in production.
      recordReviewVariant(uid, concept.id, variant.id).catch((err) => {
        console.error("recordReviewVariant failed", err);
      });
    })();
  }, [concept]);

  const advance = () => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= cards.length) {
        setStatus("done");
        return i;
      }
      return next;
    });
  };

  return (
    <MapShell>
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[600px] lg:max-w-[760px] flex-col">
      {/* ── Header ── */}
      <header className="relative flex items-center justify-between px-5 py-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <Link href="/learn">← back</Link>
        </Button>
        <span className="absolute left-1/2 -translate-x-1/2 font-display font-semibold text-sm truncate max-w-[200px]" style={{ color: "var(--tc-ink)" }}>
          {concept.title}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {status === "playing" ? `${index + 1} / ${cards.length}` : "review"}
        </span>
      </header>

      {status === "playing" && (
        <Progress
          value={((index + 1) / cards.length) * 100}
          className="h-[3px] rounded-none"
        />
      )}

      <div className="relative flex flex-1 items-center justify-center px-5 py-6 lg:py-10">
        {status === "loading" && (
          <p className="font-mono text-xs text-[var(--color-fg-muted)]">
            loading review…
          </p>
        )}

        {(status === "no-user" || status === "empty") && (
          <div className="w-full max-w-[420px] text-center">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)] mb-3">
              Review
            </p>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink)] mb-3">
              Nothing to review yet
            </h1>
            <p className="text-[14px] leading-relaxed text-[var(--color-fg-muted)] mb-7">
              {status === "no-user"
                ? "Finish this concept once and it becomes available to review."
                : "This concept has no review questions available right now."}
            </p>
            <Button asChild className="rounded-full font-bold px-10">
              <Link href="/learn">Back to learning</Link>
            </Button>
          </div>
        )}

        {status === "playing" && (
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
                recall
              </p>
              {/* Reused verbatim from the lesson/daily flows — full quiz card
                  (correctIndex/explanation) since a review is played inline by a
                  known user (no spoiler-free strip needed). onAnswered's `correct`
                  is intentionally ignored: reviews are ungraded in 9.2. */}
              <QuizCard card={cards[index]} onAnswered={advance} />
            </motion.div>
          </AnimatePresence>
        )}

        {status === "done" && (
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
              Review complete
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)] mb-3">
              {concept.title}
            </h1>
            <p className="text-[14px] leading-relaxed text-[var(--color-fg-muted)] mb-7">
              You practised {cards.length} question{cards.length === 1 ? "" : "s"}.
              Reviews keep the concept fresh — no XP, just memory.
            </p>
            <Button asChild className="rounded-full font-bold px-10">
              <Link href="/learn">Continue</Link>
            </Button>
          </motion.div>
        )}
      </div>
    </main>
    </MapShell>
  );
}
