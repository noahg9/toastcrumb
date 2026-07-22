"use client";

// Logged-out daily-challenge play (Story 8.2). No account, no API calls, no XP,
// no streak — purely local. Reuses the lesson quiz mechanics via the shared
// QuizCard; the once-per-day lock lives in date-scoped localStorage.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { questionId } from "@toastcrumb/types";
import type { DailyChallenge as DailyChallengeType } from "@/lib/daily";
import { QuizCard } from "@/components/QuizCard";
import { RichText } from "@/components/rich-text";
import { MapShell } from "@/components/MapShell";
import { Button } from "@/components/ui/button";
import { createUser, getStoredUserId, recordQuizOutcomes, setStoredUserId } from "@/lib/api";
import { track } from "@/lib/analytics";
import { buildDailyShareText } from "@/lib/daily-share";
import { currentDailyStreak, isMilestone } from "@/lib/daily-streak";

// Story 10.5 — record the daily challenge's per-question difficulty outcome.
// This is the app's FIRST daily→server write (the daily was previously 100%
// client/localStorage). Fully fire-and-forget: it bootstraps an anonymous user
// id if none exists (mirroring LessonPlayer), never blocks the resolved view,
// and swallows all failures — the daily's "no account required" play is
// unchanged. Daily challenges are never pretests (buildDailyPool excludes them),
// so `isPretest` is always false. `challenge.id` is `conceptId:lessonId:index`.
async function recordDailyOutcome(
  challenge: DailyChallengeType,
  correct: boolean,
  latencyMs: number,
): Promise<void> {
  try {
    let uid = getStoredUserId();
    if (!uid) {
      const u = await createUser();
      uid = u.id;
      setStoredUserId(u.id);
    }
    const lessonId = challenge.id.split(":")[1] ?? challenge.id;
    await recordQuizOutcomes(uid, [
      {
        conceptId: challenge.conceptId,
        lessonId,
        questionId: questionId(challenge.question),
        correct,
        isPretest: false,
        latencyMs,
        surface: "daily",
      },
    ]);
  } catch (err) {
    console.error("recordDailyOutcome failed", err);
  }
}

type StoredResult = {
  picked: number;
  correct: boolean;
  answeredAt: string;
  /** Shuffled position -> original option index, so the resolved view replays
   * the exact order the user saw instead of the unshuffled source order. */
  order: number[];
};

// Date-scoped so a new challenge-day (new key) is a fresh, playable challenge.
const KEY_PREFIX = "toastcrumb_daily_";
function storageKey(challengeDate: string): string {
  return `${KEY_PREFIX}${challengeDate}`;
}

// Impure, effect-only: enumerate the date suffixes of every per-day play key in
// localStorage that holds a *valid* stored result. A day counts as "played" only
// when its value parses and matches the StoredResult shape — the same "played"
// definition the play gate uses (below), so streak/archive/gate can't disagree
// about whether a day happened (a corrupt/empty/tampered value is not a play).
// The one thing this can't cross-check is `order.length === options.length`: the
// per-day option count lives behind the server-only getDailyChallenge and isn't
// available for arbitrary past days here, so that stricter mismatch stays
// gate-only by construction. Guarded for SSR / disabled storage — returns [].
function enumeratePlayedDayKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        if (isStoredResultShape(JSON.parse(raw))) {
          keys.push(k.slice(KEY_PREFIX.length));
        }
      } catch {}
    }
  } catch {}
  return keys;
}

// Shape guard shared by every "played" surface. Guards against corrupted/foreign
// localStorage values (manual tampering, a schema change across deploys, etc.).
// The `optionsLength` cross-check is factored out into isStoredResult because
// only the play gate has the current day's option count in scope.
function isStoredResultShape(value: unknown): value is StoredResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.picked === "number" &&
    typeof v.correct === "boolean" &&
    typeof v.answeredAt === "string" &&
    Array.isArray(v.order) &&
    v.order.every((n) => typeof n === "number")
  );
}

// Full gate check: valid shape AND the stored answer order matches this day's
// option count (catches a stored result invalidated by a content redeploy).
function isStoredResult(value: unknown, optionsLength: number): value is StoredResult {
  return isStoredResultShape(value) && value.order.length === optionsLength;
}

const container =
  "mx-auto flex min-h-dvh w-full max-w-[600px] lg:max-w-[760px] flex-col";
const cardSurface =
  "w-full rounded-3xl p-8 lg:p-12 flex flex-col lg:min-h-[280px]";

// On the canonical today page the left slot is the brand home link; on an
// archived dated page it's a "← Today" link back to /daily (AC 11).
function Header({ backToToday = false }: { backToToday?: boolean }) {
  return (
    <header className="flex items-center justify-between px-5 py-3 shrink-0">
      {backToToday ? (
        <Link
          href="/daily"
          className="text-sm font-semibold text-[var(--color-brand-text)]"
        >
          ← Today
        </Link>
      ) : (
        <Link
          href="/learn"
          className="font-bold text-[var(--color-ink)] text-sm tracking-tight"
        >
          ToastCrumb
        </Link>
      )}
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)]">
        Daily Challenge
      </span>
    </header>
  );
}

export function DailyChallenge({
  challenge,
  challengeDate,
  challengeNumber,
  shareUrl,
  enableStreak = false,
  backToToday = false,
}: {
  challenge: DailyChallengeType | null;
  challengeDate: string;
  /** Human-facing "Daily #N", derived server-side (Story 8.3). */
  challengeNumber: number;
  /** Absolute link back to the challenge for the share block (Story 8.3). */
  shareUrl: string;
  /**
   * Story 8.4: show + share the daily-challenge streak. Only the canonical
   * today page (`/daily`) sets this; archived dated pages (`/daily/[date]`)
   * omit it, since "current streak" is meaningless when reviewing a past day.
   */
  enableStreak?: boolean;
  /** Story 8.4: dated pages replace the brand home link with "← Today" (AC 11). */
  backToToday?: boolean;
}) {
  // Hydration-safe once-per-day decision (Story 7.4 AC 8 discipline):
  //   null  -> not yet read from localStorage (render a neutral placeholder)
  //   false -> nothing stored for today (playable)
  //   object -> already played today (resolved)
  // Read inside the effect, never during render, so the resolved state never
  // flashes on first paint.
  const [result, setResult] = useState<StoredResult | null | false>(null);
  const pickedRef = useRef<{ index: number; order: number[] } | null>(null);

  // Story 8.4: daily-challenge streak, derived client-side only (the server has
  // no localStorage). Computed in an effect — never during render/SSR — so it
  // shares the tri-state gate's no-hydration-flash discipline. This effect covers
  // the initial resolve (mount + when stored state loads); the commit handler
  // recomputes synchronously to avoid a one-frame stale flash on answering.
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    if (!enableStreak || !challenge) return;
    setStreak(currentDailyStreak(enumeratePlayedDayKeys(), challengeDate));
  }, [enableStreak, challenge, challengeDate, result]);

  useEffect(() => {
    if (!challenge) return; // no-challenge state doesn't touch storage
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey(challengeDate));
    } catch {}
    if (!stored) {
      setResult(false);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      setResult(isStoredResult(parsed, challenge.options.length) ? parsed : false);
    } catch {
      setResult(false);
    }
  }, [challenge, challengeDate]);

  // AC 8 — graceful degradation: no challenge resolvable for today.
  if (!challenge) {
    return (
      <MapShell>
      <main className={container}>
        <Header backToToday={backToToday} />
        <div className="flex flex-1 items-center justify-center px-5 py-6 lg:py-10">
          <div
            className={`${cardSurface} items-center justify-center text-center`}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p className="text-[17px] font-semibold text-[var(--color-ink)] mb-2">
              No challenge today
            </p>
            <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed">
              Check back soon — a new daily challenge is on the way.
            </p>
            <Link
              href="/learn"
              className="mt-6 text-xs font-semibold text-[var(--color-brand-text)]"
            >
              Explore concepts →
            </Link>
          </div>
        </div>
      </main>
      </MapShell>
    );
  }

  const commit = (correct: boolean, latencyMs: number) => {
    const res: StoredResult = {
      picked: pickedRef.current?.index ?? -1,
      order: pickedRef.current?.order ?? challenge.options.map((_, i) => i),
      correct,
      answeredAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(storageKey(challengeDate), JSON.stringify(res));
    } catch {}
    setResult(res);
    // Story 10.5: record the difficulty outcome (fire-and-forget, non-blocking).
    void recordDailyOutcome(challenge, correct, latencyMs);
    // Story 14.2: behavioral funnel — the daily was played. Fire-and-forget and
    // SEPARATE from the difficulty write above. PII-free props (ids + outcome).
    track(
      "daily_played",
      { conceptId: challenge.conceptId, challengeNumber, correct },
      "daily",
    );
    // Recompute the streak in the same batch as setResult so the resolved view
    // paints the correct value immediately. The result-keyed effect below runs
    // only after paint, so relying on it alone would flash the pre-commit streak
    // for one frame (first play: no line → "1-day"; grace day: "N" → "N+1").
    if (enableStreak) {
      setStreak(currentDailyStreak(enumeratePlayedDayKeys(), challengeDate));
    }
  };

  return (
    <MapShell>
    <main className={container}>
      <Header backToToday={backToToday} />
      <div className="flex flex-1 items-center justify-center px-5 py-6 lg:py-10">
        <div
          className={cardSurface}
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase mb-4 text-[var(--color-fg-muted)]">
            {challenge.conceptTitle}
          </p>

          {result === null ? (
            // Neutral placeholder until the effect resolves the play state.
            <div className="flex-1" aria-hidden />
          ) : result === false ? (
            <>
              <QuizCard
                card={challenge}
                onPicked={(originalIndex, order) => {
                  pickedRef.current = { index: originalIndex, order };
                }}
                onAnswered={commit}
              />
              <ArchiveLink className="mt-6" />
            </>
          ) : (
            <ResolvedResult
              challenge={challenge}
              result={result}
              challengeNumber={challengeNumber}
              shareUrl={shareUrl}
              // Streak is a today-only concept (AC 6) — pass 0 on archived days.
              streak={enableStreak ? streak : 0}
            />
          )}
        </div>
      </div>
    </main>
    </MapShell>
  );
}

// "Past challenges" archive entry point (AC 11). Shown from both the playable and
// resolved states; uses the existing brand link style.
function ArchiveLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/daily/archive"
      className={`inline-block text-xs font-semibold text-[var(--color-brand-text)] ${className}`}
    >
      Past challenges →
    </Link>
  );
}

// Non-interactive replay of the committed answer + "come back tomorrow" — shown
// after commit and on any revisit during the same challenge-day (AC 5).
function ResolvedResult({
  challenge,
  result,
  challengeNumber,
  shareUrl,
  streak,
}: {
  challenge: DailyChallengeType;
  result: StoredResult;
  challengeNumber: number;
  shareUrl: string;
  /** Daily-challenge streak (Story 8.4); 0 = don't show/share (archived days). */
  streak: number;
}) {
  const showStreak = streak >= 1;
  // Story 10.2: on a same-day revisit of a WRONG answer, surface the explanation
  // for the option the learner actually picked (result.picked is the ORIGINAL
  // index), matching the fresh-play QuizCard reveal. Undefined when correct, when
  // there's no per-option text, or when no option was recorded — then we fall
  // back to the generic `explanation` exactly as before.
  const pickedExplanation =
    !result.correct && result.picked >= 0
      ? challenge.optionExplanations?.[result.picked]?.trim() || undefined
      : undefined;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col"
    >
      <p className="text-[17px] font-semibold leading-snug text-[var(--color-ink)] mb-5">
        {challenge.question}
      </p>
      <ul className="flex flex-col gap-2 flex-1">
        {result.order.map((originalIndex, i) => {
          const state =
            originalIndex === challenge.correctIndex
              ? "right"
              : originalIndex === result.picked
                ? "wrong"
                : "dim";
          return (
            <li key={i}>
              <div
                className="w-full rounded-xl px-4 py-3 text-left text-sm"
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
                {challenge.options[originalIndex]}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
        {pickedExplanation && (
          <RichText
            className={`text-sm text-[var(--color-fg-muted)] leading-relaxed ${
              challenge.explanation ? "mb-2" : "mb-3"
            }`}
            dark={false}
            text={pickedExplanation}
          />
        )}
        {challenge.explanation && (
          <RichText
            className="text-sm text-[var(--color-fg-muted)] leading-relaxed mb-3"
            dark={false}
            text={
              pickedExplanation || result.correct
                ? challenge.explanation
                : `Close — ${challenge.explanation}`
            }
          />
        )}
        <p className="text-sm font-medium text-[var(--color-ink)]">
          {result.correct ? "Nailed it ✓" : "Not this time"} — you&apos;ve played
          today&apos;s challenge. Come back tomorrow for a new one.
        </p>
        {showStreak && (
          <div className="mt-3" aria-live="polite">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              🔥 {streak}-day streak
            </p>
            {isMilestone(streak) && (
              <p className="mt-1 text-sm font-medium text-[var(--color-brand-text)]">
                🎉 {streak}-day streak — nice.
              </p>
            )}
          </div>
        )}
        <ShareResult
          challengeNumber={challengeNumber}
          correct={result.correct}
          shareUrl={shareUrl}
          streak={showStreak ? streak : undefined}
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/learn"
            className="inline-block text-xs font-semibold text-[var(--color-brand-text)]"
          >
            Explore concepts →
          </Link>
          <ArchiveLink />
        </div>
      </div>
    </motion.div>
  );
}

// Spoiler-free share block (Story 8.3). The copyable text encodes only the
// pass/fail outcome + challenge number + link — never the question, options,
// answer, or explanation. Clipboard is guarded and degrades gracefully: on old
// browsers / insecure origins the block stays on-page and selectable with a
// manual-copy hint (no dependency, no deprecated execCommand).
function ShareResult({
  challengeNumber,
  correct,
  shareUrl,
  streak,
}: {
  challengeNumber: number;
  correct: boolean;
  shareUrl: string;
  /** Story 8.4: when >= 1, adds the `🔥 <n> day streak` line via the 8.3 seam. */
  streak?: number;
}) {
  const shareText = buildDailyShareText({
    challengeNumber,
    correct,
    url: shareUrl,
    // AC 7: only a clean, positive integer ever reaches the builder / share text.
    streak:
      typeof streak === "number" && Number.isInteger(streak) && streak >= 1
        ? streak
        : undefined,
  });

  // "idle" -> "copied" (2s revert) -> "manual" (clipboard unavailable/failed).
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const revertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    return () => {
      if (revertRef.current) clearTimeout(revertRef.current);
    };
  }, []);

  // Selects the share block's text so a manual ⌘/Ctrl-C actually has something
  // to copy — needed both on entering the "manual" fallback and for keyboard
  // users tabbing into the block (mouse-only `select-all` CSS doesn't cover them).
  const selectShareText = () => {
    const node = preRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleCopy = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    if (revertRef.current) clearTimeout(revertRef.current);
    try {
      if (!navigator.clipboard?.writeText) {
        setStatus("manual");
        selectShareText();
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setStatus("copied");
      revertRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      // Permission denied / non-secure context: leave the block selectable.
      setStatus("manual");
      selectShareText();
    } finally {
      pendingRef.current = false;
    }
  };

  return (
    <div className="mt-5">
      <pre
        ref={preRef}
        tabIndex={0}
        onFocus={selectShareText}
        className="whitespace-pre-wrap break-words rounded-xl px-4 py-3 font-mono text-xs leading-relaxed select-all"
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-ink)",
        }}
      >
        {shareText}
      </pre>
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          aria-label="Copy your spoiler-free result to the clipboard"
        >
          {status === "copied" ? "Copied!" : "Copy result"}
        </Button>
        {status === "manual" && (
          <span className="text-xs text-[var(--color-fg-muted)]">
            Press ⌘/Ctrl-C to copy
          </span>
        )}
      </div>
      {/* Screen-reader announcement for the transient copy feedback. */}
      <span aria-live="polite" className="sr-only">
        {status === "copied"
          ? "Result copied to clipboard"
          : status === "manual"
            ? "Copy unavailable — select the text and press Command or Control C to copy"
            : ""}
      </span>
    </div>
  );
}
