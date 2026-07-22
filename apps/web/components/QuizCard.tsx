"use client";

// Quiz answer→reveal UI, extracted from LessonPlayer (Story 8.2) so the logged-out
// daily challenge can reuse the exact lesson quiz mechanics: Fisher-Yates option
// shuffle, tap-to-pick, tri-state styling, an answer reveal (per-distractor
// `optionExplanations` when present — Story 10.2 — else the single `explanation`,
// "Close — " prefixed when wrong), and a Continue button firing onAnswered(correct).
//
// Pure UI, zero account coupling — all user/XP/streak logic lives in the parent.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RichText } from "./rich-text";

// Structural prop: satisfied by both a lesson `QuizCard` (from @toastcrumb/types)
// and a `DailyChallenge` (apps/web/lib/daily.ts) — both carry these quiz fields.
export interface QuizCardData {
  question: string;
  options: string[];
  /** Index into `options`. */
  correctIndex: number;
  explanation?: string;
  /**
   * Story 10.2: per-distractor explanations, index-aligned to the ORIGINAL
   * `options` order (optionExplanations[i] explains options[i]). When the learner
   * picks a wrong option we show optionExplanations[shuffledToOriginal[picked]]
   * so the correction names the exact misconception they fell for. Optional and
   * additive: absent → today's single-`explanation` reveal, unchanged.
   */
  optionExplanations?: string[];
}

export function QuizCard({
  card,
  onAnswered,
  onPicked,
  isPretest = false,
}: {
  card: QuizCardData;
  /**
   * Fired once when the learner commits (taps Continue), with correctness and
   * `latencyMs` — the time from the card being shown to the option being picked
   * (retrieval effort). Story 10.5 widened this from `(correct)` to
   * `(correct, latencyMs)` for difficulty telemetry; callers that don't record
   * telemetry simply ignore the second arg.
   */
  onAnswered: (correct: boolean, latencyMs: number) => void;
  /**
   * Optional: fired once when the user first commits, with the picked option's
   * ORIGINAL index (stable across reshuffles) and the shuffle order itself
   * (shuffled position -> original index). Additive — the lesson player omits
   * it and is unaffected; the daily challenge uses it to persist the user's
   * pick AND replay the exact same option order in the resolved state.
   */
  onPicked?: (originalIndex: number, shuffleOrder: number[]) => void;
  /**
   * Story 10.1: when true, this quiz is a *pretest* — a prediction asked before
   * the concept is taught. Adds a "take a guess" framing so a wrong answer reads
   * as expected, not a failure. Purely presentational: the option shuffle,
   * correctness, and answer→explanation reveal are all unchanged; the parent
   * decides pretests don't score XP/FSRS. Other callers (daily, reviews) omit
   * this and are unaffected.
   */
  isPretest?: boolean;
}) {
  const { shuffledOptions, shuffledCorrectIndex, shuffledToOriginal } = useMemo(() => {
    const indices = card.options.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
      shuffledOptions: indices.map((i) => card.options[i]),
      shuffledCorrectIndex: indices.indexOf(card.correctIndex),
      shuffledToOriginal: indices,
    };
  }, [card]);

  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === shuffledCorrectIndex;

  // Story 10.2: when the learner picks a WRONG option, surface the explanation
  // aimed at THAT specific option — indexed to the ORIGINAL options order via the
  // existing shuffledToOriginal map — so the correction names the misconception
  // they actually fell for. Undefined when correct, when there's no per-option
  // array, or when this option's slot is empty (then we fall back to the generic
  // `explanation`, keeping today's behavior).
  const pickedExplanation =
    !correct && picked !== null
      ? card.optionExplanations?.[shuffledToOriginal[picked]]?.trim() || undefined
      : undefined;

  const cbRef = useRef(onAnswered);
  useEffect(() => {
    cbRef.current = onAnswered;
  }, [onAnswered]);

  // Story 10.5 — response-latency capture for difficulty telemetry. `shownAt` is
  // stamped once, lazily, at first render (the card is keyed per-question by every
  // caller, so a fresh mount == a freshly-shown question). `latencyMs` is measured
  // at the moment the learner PICKS an option (the retrieval act) — not at the
  // later Continue tap, which would fold in explanation-reading time — and then
  // carried out through the single `onAnswered` fire. Pure instrumentation: it
  // does not touch the shuffle, correctness, or reveal behavior.
  const shownAtRef = useRef<number | null>(null);
  if (shownAtRef.current === null) shownAtRef.current = performance.now();
  const latencyRef = useRef<number | null>(null);
  // Latch so onAnswered fires at most once per card, even if the Continue
  // button is double-tapped during its reveal/exit transition (the option
  // buttons are already guarded by `disabled={answered}`; this closes the same
  // gap for Continue). Resets on remount — every caller keys QuizCard per card.
  const continuedRef = useRef(false);

  return (
    <div className="flex-1 flex flex-col" onClick={(e) => e.stopPropagation()}>
      {isPretest && (
        <p className="text-[13px] leading-snug text-[var(--color-fg-muted)] mb-2">
          Take a guess before we explain — getting it wrong is part of how this sticks.
        </p>
      )}
      <p className="text-[17px] font-semibold leading-snug text-[var(--color-ink)] mb-5">
        {card.question}
      </p>
      <ul className="flex flex-col gap-2 flex-1">
        {shuffledOptions.map((opt, i) => {
          const state =
            picked === null
              ? "idle"
              : i === shuffledCorrectIndex
                ? "right"
                : i === picked
                  ? "wrong"
                  : "dim";
          return (
            <li key={i}>
              <motion.button
                type="button"
                disabled={answered}
                whileTap={answered ? undefined : { scale: 0.98 }}
                onClick={() => {
                  if (answered) return;
                  // Measure retrieval time at the pick (once), before reveal.
                  if (latencyRef.current === null) {
                    latencyRef.current = Math.max(
                      0,
                      Math.round(
                        performance.now() -
                          (shownAtRef.current ?? performance.now()),
                      ),
                    );
                  }
                  setPicked(i);
                  onPicked?.(shuffledToOriginal[i], shuffledToOriginal);
                }}
                className="w-full rounded-xl px-4 py-3 text-left text-sm transition-colors"
                style={{
                  background:
                    state === "right"
                      ? "var(--color-success-bg)"
                      : state === "wrong"
                        ? "var(--color-wrong-bg)"
                        : "var(--color-surface-2)",
                  border: `1px solid ${
                    state === "right"
                      ? "var(--color-success-ring)"
                      : state === "wrong"
                        ? "var(--color-wrong-ring)"
                        : "var(--color-border)"
                  }`,
                  color: "var(--color-ink)",
                  opacity: state === "dim" ? 0.3 : 1,
                }}
              >
                {opt}
              </motion.button>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">
        <AnimatePresence>
          {answered && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-5 pt-4"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              {pickedExplanation && (
                <RichText
                  className={`text-sm text-[var(--color-fg-muted)] leading-relaxed ${
                    card.explanation ? "mb-2" : "mb-3"
                  }`}
                  dark={false}
                  text={pickedExplanation}
                />
              )}
              {card.explanation && (
                <RichText
                  className="text-sm text-[var(--color-fg-muted)] leading-relaxed mb-3"
                  dark={false}
                  // With a specific per-option correction already shown, the
                  // generic explanation follows plainly (the "Close — " framing
                  // is redundant once the mistake has been named). Otherwise keep
                  // today's behavior: "Close — " prefix on a wrong answer.
                  text={
                    pickedExplanation || correct
                      ? card.explanation
                      : `Close — ${card.explanation}`
                  }
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (continuedRef.current) return;
                  continuedRef.current = true;
                  cbRef.current(correct, latencyRef.current ?? 0);
                }}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-center transition-colors"
                style={{
                  background: correct
                    ? "var(--color-success-bg)"
                    : "var(--color-surface-2)",
                  border: `1px solid ${correct ? "var(--color-success-ring)" : "var(--color-border)"}`,
                  color: "var(--color-ink)",
                }}
              >
                Continue
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
