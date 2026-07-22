"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { XP_PER_CORRECT_QUIZ, questionId } from "@toastcrumb/types";
import type { Concept, Lesson, User, StatCard, CompareCard, FlowCard, DiagramCard, ChartCard, QuizOutcome } from "@toastcrumb/types";
import {
  completeLesson,
  createUser,
  getStoredUserId,
  getUser,
  recordQuizOutcomes,
  setStoredUserId,
} from "@/lib/api";
import { track } from "@/lib/analytics";
import type { ConceptGraph } from "@/lib/graph";
import { newlyUnlocked } from "@/lib/unlock";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GlossaryContext, GlossaryControlContext, buildGlossary, RichText, Rich, CountUp } from "@/components/rich-text";
import { QuizCard } from "@/components/QuizCard";
import { MapShell } from "@/components/MapShell";
import {
  layoutDiagram,
  type SequenceLayout,
  type LayeredLayout,
} from "./diagram-layout";

// insight and reward cards flip to a dark surface
const DARK_TYPES = new Set(["insight", "reward"]);

// Rich-text machinery (GlossaryContext / GlossaryControlContext / buildGlossary /
// RichText / Rich / CountUp) lives in @/components/rich-text so the standalone
// daily-challenge QuizCard shares it.

// ─── Dialogue card — streaming chat bubbles ──────────────────────────────────

function DialogueCard({ body }: { body: string }) {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div className="flex flex-col gap-3 flex-1">
      {lines.map((line, i) => {
        const isRight = i % 2 === 1;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: isRight ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: i * 0.35 }}
            className={`flex ${isRight ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[82%] px-4 py-2.5 text-[15px] leading-snug"
              style={{
                background: isRight
                  ? "var(--color-brand-bg)"
                  : "var(--color-surface-2)",
                border: `1px solid ${isRight ? "var(--color-brand-ring)" : "var(--color-border)"}`,
                color: "var(--color-ink)",
                borderRadius: 18,
                ...(isRight
                  ? { borderBottomRightRadius: 4 }
                  : { borderBottomLeftRadius: 4 }),
              }}
            >
              <Rich text={line} dark={false} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Visual card components ───────────────────────────────────────────────────

function StatVisual({ card }: { card: StatCard }) {
  const raw = card.value.replace(/,/g, "");
  const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
  const suffix = raw.replace(/[0-9.]/g, "").trim();
  const isNumeric = !isNaN(num) && num > 99;
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-4 flex-1">
      <p className="text-[64px] font-bold leading-none" style={{ color: "var(--color-brand-text)" }}>
        {isNumeric ? (
          <>
            <CountUp value={num} />
            {suffix}
          </>
        ) : (
          card.value
        )}
      </p>
      <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-fg-muted)]">
        {card.unit}
      </p>
      <p className="text-[16px] leading-relaxed text-[var(--color-ink)] max-w-[320px] mt-1">
        <Rich text={card.context} dark={false} />
      </p>
    </div>
  );
}

function CompareVisual({ card }: { card: CompareCard }) {
  return (
    <div className="flex gap-3 flex-1">
      {([card.left, card.right] as const).map((side, i) => (
        <div
          key={i}
          className="flex-1 rounded-2xl p-4 flex flex-col gap-2"
          style={{
            background: i === 0 ? "var(--color-wrong-bg)" : "var(--color-success-bg)",
            border: `1px solid ${i === 0 ? "var(--color-wrong-ring)" : "var(--color-success-ring)"}`,
          }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: i === 0 ? "var(--color-wrong-ring)" : "var(--color-success)" }}
          >
            {side.label}
          </p>
          <ul className="flex flex-col gap-1.5">
            {side.points.map((pt, j) => (
              <li key={j} className="text-[13px] leading-snug text-[var(--color-ink)] flex gap-2">
                <span style={{ color: i === 0 ? "var(--color-wrong-ring)" : "var(--color-success)" }}>
                  {i === 0 ? "✗" : "✓"}
                </span>
                <span>
                  <Rich text={pt} dark={false} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FlowVisual({ card }: { card: FlowCard }) {
  return (
    <div className="flex flex-col flex-1">
      {card.steps.map((step, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: i * 0.1 }}
          className="flex gap-3"
        >
          <div className="flex flex-col items-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ background: "var(--color-brand)", color: "#1a0800" }}
            >
              {i + 1}
            </div>
            {i < card.steps.length - 1 && (
              <div className="w-px flex-1 my-1" style={{ background: "var(--color-border)" }} />
            )}
          </div>
          <div className="pb-4">
            <p className="text-[15px] font-semibold text-[var(--color-ink)]">{step.label}</p>
            {step.detail && (
              <p className="text-[13px] text-[var(--color-fg-muted)] mt-0.5 leading-snug">
                <Rich text={step.detail} dark={false} />
              </p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/** Truncate a node/actor label so it fits inside its box (SVG text can't wrap). */
function fitLabel(label: string, max = 15): string {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

function SequenceSvg({ layout }: { layout: SequenceLayout }) {
  const { width, height, actors, lifelines, messages } = layout;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxWidth: "none", overflow: "visible" }}
    >
      <defs>
        <marker id="seq-arrow" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
          <path d="M0,0 L6.5,3 L0,6 Z" style={{ fill: "var(--color-brand-text)" }} />
        </marker>
      </defs>
      {lifelines.map((l, i) => (
        <line
          key={`ll-${i}`}
          x1={l.x}
          y1={l.y1}
          x2={l.x}
          y2={l.y2}
          style={{ stroke: "var(--color-border)" }}
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}
      {actors.map((a) => (
        <g key={a.id}>
          <rect
            x={a.x}
            y={a.y}
            width={a.w}
            height={a.h}
            rx={10}
            style={{ fill: "var(--color-surface-2)", stroke: "var(--color-border)" }}
            strokeWidth={1}
          />
          <text
            x={a.x + a.w / 2}
            y={a.y + a.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11.5}
            fontWeight={600}
            style={{ fill: "var(--color-ink)" }}
          >
            {fitLabel(a.label, 13)}
          </text>
        </g>
      ))}
      {messages.map((m, i) => {
        if (m.self) {
          return (
            <g key={`m-${i}`}>
              <path
                d={`M ${m.x1} ${m.y - 7} h 20 v 14 h -20`}
                fill="none"
                style={{ stroke: "var(--color-brand-text)" }}
                strokeWidth={1.5}
                markerEnd="url(#seq-arrow)"
              />
              {m.label && (
                <text x={m.x1 + 26} y={m.y} dominantBaseline="central" fontSize={10.5} style={{ fill: "var(--color-fg-muted)" }}>
                  {m.label}
                </text>
              )}
            </g>
          );
        }
        return (
          <g key={`m-${i}`}>
            {m.label && (
              <text
                x={(m.x1 + m.x2) / 2}
                y={m.y - 6}
                textAnchor="middle"
                fontSize={10.5}
                style={{ fill: "var(--color-fg-muted)" }}
              >
                {m.label}
              </text>
            )}
            <line
              x1={m.x1}
              y1={m.y}
              x2={m.x2}
              y2={m.y}
              style={{ stroke: "var(--color-brand-text)" }}
              strokeWidth={1.5}
              markerEnd="url(#seq-arrow)"
            />
          </g>
        );
      })}
    </svg>
  );
}

function LayeredSvg({ layout }: { layout: LayeredLayout }) {
  const { width, height, boxes, conns, variant } = layout;
  const pill = variant === "state";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxWidth: "none", overflow: "visible" }}
    >
      <defs>
        <marker id="lay-arrow" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
          <path d="M0,0 L6.5,3 L0,6 Z" style={{ fill: "var(--color-brand-text)" }} />
        </marker>{/* forward arrowhead */}
        <marker id="lay-arrow-dim" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
          <path d="M0,0 L6.5,3 L0,6 Z" style={{ fill: "var(--color-fg-muted)" }} />
        </marker>
      </defs>
      {conns.map((c, i) => {
        const d = "M " + c.points.map((p) => `${p.x} ${p.y}`).join(" L ");
        return (
          <g key={`c-${i}`}>
            <path
              d={d}
              fill="none"
              style={{ stroke: c.back ? "var(--color-fg-muted)" : "var(--color-brand-text)" }}
              strokeWidth={1.5}
              strokeOpacity={c.back ? 0.5 : 1}
              markerEnd={c.back ? "url(#lay-arrow-dim)" : "url(#lay-arrow)"}
            />
            {c.label && (
              <text
                x={c.labelAt.x}
                y={c.labelAt.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                style={{ fill: "var(--color-fg-muted)" }}
              >
                {c.label}
              </text>
            )}
          </g>
        );
      })}
      {boxes.map((b) => (
        <g key={b.id}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={pill ? b.h / 2 : 12}
            style={{ fill: "var(--color-surface-2)", stroke: "var(--color-border)" }}
            strokeWidth={1}
          />
          <text
            x={b.x + b.w / 2}
            y={b.y + b.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
            style={{ fill: "var(--color-ink)" }}
          >
            {fitLabel(b.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DiagramVisual({ card }: { card: DiagramCard }) {
  const layout = useMemo(
    () => layoutDiagram(card.nodes, card.edges, card.variant),
    [card],
  );
  const variantLabel =
    layout.kind === "sequence"
      ? "Sequence"
      : layout.variant === "tree"
        ? "Hierarchy"
        : layout.variant === "state"
          ? "State machine"
          : "Architecture";

  return (
    <div className="flex flex-col gap-3 flex-1">
      {card.headline && (
        <p className="text-[16px] font-semibold leading-snug text-[var(--color-ink)]">
          {card.headline}
        </p>
      )}
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        {variantLabel} diagram
      </p>
      <div className="overflow-x-auto py-1">
        {layout.kind === "sequence" ? (
          <SequenceSvg layout={layout} />
        ) : (
          <LayeredSvg layout={layout} />
        )}
      </div>
      {card.body && (
        <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">
          <Rich text={card.body} dark={false} />
        </p>
      )}
    </div>
  );
}

function ChartVisual({ card }: { card: ChartCard }) {
  const max = Math.max(...card.data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-3 flex-1">
      {card.title && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
          {card.title}
        </p>
      )}
      {card.data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[12px] text-[var(--color-ink)] w-24 shrink-0 text-right leading-snug">
            {item.label}
          </span>
          <div
            className="flex-1 h-5 rounded-full overflow-hidden"
            style={{ background: "var(--color-surface-2)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--color-brand)" }}
              initial={{ width: "0%" }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: "easeOut" }}
            />
          </div>
          <span className="font-mono text-[11px] text-[var(--color-fg-muted)] w-16 shrink-0">
            {item.value.toLocaleString()}
            {item.unit ? ` ${item.unit}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main player ─────────────────────────────────────────────────────────────

export function LessonPlayer({
  concept,
  lesson,
  graph,
  onContinue,
  telemetrySurface = "lesson",
}: {
  concept: Concept;
  lesson: Lesson;
  graph: ConceptGraph;
  /**
   * Optional override for the completion screen's "Continue" action (Story 9.3).
   * When provided, "Continue" invokes this instead of linking to /learn — the
   * daily-session player uses it to advance from the new-concept phase into
   * reviews. Omitted on the standalone /lesson route, whose behavior is
   * unchanged (Continue → /learn).
   */
  onContinue?: () => void;
  /**
   * Event `surface` tag for this instance's lesson_start/lesson_complete/
   * lesson_abandon telemetry (Story 14.2). Defaults to "lesson" for the
   * standalone /lesson route; SessionPlayer passes "session" so the 14.3
   * event stream can distinguish a standalone lesson visit from a lesson
   * embedded in a daily session's new-concept phase.
   */
  telemetrySurface?: string;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [levelAtStart, setLevelAtStart] = useState<number | null>(null);
  const [completedBefore, setCompletedBefore] = useState<string[] | null>(null);
  const [userAfter, setUserAfter] = useState<User | null>(null);
  // Guest = no account JWT. Read hydration-safely in an effect (never during
  // render) so the nudge doesn't flash on first paint (Story 7.4 AC 8).
  const [isGuest, setIsGuest] = useState(false);
  // Tracks which insight card indices the user has already tapped to reveal
  const [revealed, setRevealedSet] = useState<Set<number>>(new Set());
  // Which glossary term popup (if any) is open on the current card. Lifted here
  // so a tap on the card body closes an open definition instead of advancing.
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  // Story 10.5 — per-question difficulty telemetry accumulated as each quiz card
  // is answered (pretests included, flagged), POSTed fire-and-forget once at
  // lesson completion. Pure instrumentation: never affects XP/streak/FSRS/flow.
  const outcomesRef = useRef<QuizOutcome[]>([]);
  // Quiz cards can now be revisited via the persistent back control, which
  // remounts a fresh (unanswered) QuizCard. Track which card indices have
  // already been scored so re-answering a revisited quiz never double-counts XP
  // or duplicates the Story 10.5 telemetry above — only the first answer counts.
  const scoredRef = useRef<Set<number>>(new Set());

  const card = lesson.cards[index];
  const isLast = index === lesson.cards.length - 1;
  const isQuiz = card.type === "quiz";
  // Story 10.1: a pretest is a prediction quiz asked before the concept is taught.
  // It renders and is answerable like any quiz but is excluded from XP scoring
  // (a lucky guess shouldn't earn the +5, a wrong guess shouldn't be a failure).
  const isPretest = isQuiz && (card as { pretest?: boolean }).pretest === true;
  const isDialogue = card.type === "dialogue";
  const isInsight = card.type === "insight";
  const isDark = DARK_TYPES.has(card.type);
  const isMisconception = card.type === "misconception";
  const isRevealed = revealed.has(index);

  // Lesson-wide term → definition map, so every mention of an annotated term is
  // tappable, not just the first one carrying the [[term|def]] markup.
  const glossary = useMemo(() => buildGlossary(lesson.cards), [lesson.cards]);
  const glossaryControl = useMemo(
    () => ({ openId: openTerm, setOpenId: setOpenTerm }),
    [openTerm],
  );

  const showCompletion = completed || (isLast && card.type === "reward");
  const rewardBody = card.type === "reward" ? card.body : undefined;
  const quizBonus = XP_PER_CORRECT_QUIZ * correctCount;

  const unlocked =
    userAfter && completedBefore
      ? newlyUnlocked(graph, completedBefore, userAfter.completedConcepts)
      : [];

  const advance = () => {
    setDirection(1);
    if (isLast) setCompleted(true);
    else setIndex((i) => i + 1);
  };

  const goBack = () => {
    if (index === 0) return;
    setDirection(-1);
    setIndex((i) => i - 1);
  };

  const handleCardClick = () => {
    if (openTerm) {
      // A definition popup is open — a tap on the card dismisses it rather than
      // advancing, so reading a term's definition never skips you ahead a card.
      setOpenTerm(null);
    } else if (isInsight && !isRevealed) {
      // First tap on a blurred insight card: reveal content, don't advance
      setRevealedSet((prev) => new Set([...prev, index]));
    } else if (!isQuiz) {
      advance();
    }
  };

  // Any open definition popup belongs to the card being left, so close it
  // whenever the card changes (in either direction).
  useEffect(() => {
    setOpenTerm(null);
  }, [index]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showCompletion) headingRef.current?.focus();
  }, [showCompletion]);

  // ── Story 14.2 behavioral funnel: lesson_start on mount, lesson_abandon on
  // unmount if the concept was never finished. Pure fire-and-forget telemetry —
  // never affects XP/streak/FSRS/navigation (Decision 5). lessonIndexRef mirrors
  // the live card index so an abandon event can report how far the learner got;
  // lessonFinishedRef flips true at completion so finishing is never mislabeled
  // as an abandon. Keyed on the lesson identity so a fresh lesson (e.g. the next
  // concept in a daily session, which remounts LessonPlayer) is a new boundary.
  const lessonIndexRef = useRef(0);
  useEffect(() => {
    lessonIndexRef.current = index;
  }, [index]);
  const lessonFinishedRef = useRef(false);
  useEffect(() => {
    if (showCompletion) lessonFinishedRef.current = true;
  }, [showCompletion]);
  // Guards this mount/unmount pair against React StrictMode's dev-mode
  // double-invoke (mount → cleanup → mount, synchronously, same deps). A
  // simple "already started" ref can't help here because the cleanup itself
  // does meaningful work (the abandon signal) — instead, defer the abandon by
  // one tick and cancel it if the effect re-runs before the timer fires. A
  // StrictMode remount cancels it (correctly suppressing the phantom abandon
  // and the duplicate lesson_start); a real unmount lets the timer fire.
  const pendingAbandonRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingAbandonRef.current !== null) {
      clearTimeout(pendingAbandonRef.current);
      pendingAbandonRef.current = null;
    } else {
      track(
        "lesson_start",
        { conceptId: concept.id, lessonId: lesson.id },
        telemetrySurface,
      );
    }
    return () => {
      if (lessonFinishedRef.current) return;
      pendingAbandonRef.current = setTimeout(() => {
        pendingAbandonRef.current = null;
        track(
          "lesson_abandon",
          { conceptId: concept.id, lessonId: lesson.id, cardIndex: lessonIndexRef.current },
          telemetrySurface,
        );
      }, 0);
    };
  }, [concept.id, lesson.id, telemetrySurface]);

  useEffect(() => {
    const stored = getStoredUserId();
    if (stored) {
      setUserId(stored);
      return;
    }
    createUser()
      .then((u) => {
        setStoredUserId(u.id);
        setUserId(u.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let jwt: string | null = null;
    try {
      jwt = localStorage.getItem("toastcrumb_jwt");
    } catch {}
    setIsGuest(!jwt);
  }, []);

  useEffect(() => {
    if (!userId) return;
    getUser(userId)
      .then((u) => {
        setLevelAtStart(u.level);
        setCompletedBefore(u.completedConcepts);
      })
      .catch(() => {});
  }, [userId]);

  const completedCalledRef = useRef(false);
  useEffect(() => {
    if (showCompletion && userId && !completedCalledRef.current) {
      completedCalledRef.current = true;
      completeLesson(userId, correctCount, concept.id)
        .then(setUserAfter)
        .catch(() => {});
      // Story 10.5: flush difficulty telemetry fire-and-forget, SEPARATELY from
      // the load-bearing lesson-complete scoring call above — a telemetry
      // failure must never affect XP/streak/completion/navigation.
      recordQuizOutcomes(userId, outcomesRef.current).catch((err) =>
        console.error("recordQuizOutcomes failed", err),
      );
      // Story 14.2: the behavioral funnel end. A SEPARATE fire-and-forget event
      // from the lesson-complete scoring call above — it must never replace or
      // alter that scoring write (Decision 5). PII-free props (ids + a count).
      track(
        "lesson_complete",
        { conceptId: concept.id, lessonId: lesson.id, correctCount },
        telemetrySurface,
      );
    }
  }, [showCompletion, userId, correctCount, concept.id, lesson.id, telemetrySurface]);

  const progressPct = ((index + 1) / lesson.cards.length) * 100;

  // Card surface colors vary by type
  const cardBg = isDark
    ? "#0e1520"
    : isMisconception
      ? "var(--color-wrong-bg)"
      : "var(--color-surface)";
  const cardBorder = isDark
    ? "1px solid rgba(255,255,255,0.09)"
    : isMisconception
      ? "1px solid var(--color-wrong-ring)"
      : "1px solid var(--color-border)";
  const inkColor = isDark ? "#e6edf3" : "var(--color-ink)";
  const labelColor = isDark
    ? "rgba(230,237,243,0.55)"
    : isMisconception
      ? "rgba(200,60,60,0.75)"
      : "var(--color-fg-muted)";

  return (
    <GlossaryContext.Provider value={glossary}>
    <GlossaryControlContext.Provider value={glossaryControl}>
    <MapShell>
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[600px] lg:max-w-[760px] flex-col">
      {/* ── Header ── */}
      <header className="relative flex items-center justify-between px-5 py-3 shrink-0">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground -ml-2">
          <Link href="/learn">← back</Link>
        </Button>
        <span className="absolute left-1/2 -translate-x-1/2 font-display font-semibold text-sm truncate max-w-[200px]" style={{ color: "var(--tc-ink)" }}>
          {concept.title}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {index + 1} / {lesson.cards.length}
        </span>
      </header>

      {/* ── Progress bar ── */}
      <Progress value={progressPct} className="h-[3px] rounded-none" />

      <div className="relative flex flex-1 items-center justify-center px-5 py-6 lg:py-10">
        {showCompletion ? (
          <motion.div
            key="completion"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full rounded-3xl p-8 lg:p-12 text-center"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 14px 38px -16px rgba(120,92,52,0.32)",
            }}
          >
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)] mb-3">
              Concept complete
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-3xl font-bold tracking-tight text-[var(--color-ink)] outline-none mb-3"
            >
              {concept.title}
            </h1>
            <p className="text-[14px] leading-relaxed text-[var(--color-fg-muted)] mb-7">
              {rewardBody ?? "Nice work — you finished the concept."}
            </p>

            <p
              className="font-mono text-[40px] font-bold tracking-tight leading-none mb-1"
              style={{ color: "var(--color-brand-text)" }}
            >
              +{lesson.xpReward} xp
            </p>
            {quizBonus > 0 && (
              <p className="font-mono text-xs text-[var(--color-fg-muted)] mb-0">
                +{quizBonus} xp quiz bonus
              </p>
            )}

            {userAfter && (
              <div className="mt-5">
                <div
                  className="h-px my-4"
                  style={{ background: "var(--color-border)" }}
                />
                {levelAtStart != null && userAfter.level > levelAtStart && (
                  <motion.p
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.22, delay: 0.1 }}
                    className="text-[15px] font-semibold text-[var(--color-brand-text)] mb-1"
                  >
                    Level up — you reached Level {userAfter.level}
                  </motion.p>
                )}
                <p className="font-mono text-xs text-[var(--color-fg-muted-2)]">
                  lv {userAfter.level} · {userAfter.xp} xp
                </p>
                {userAfter.streak >= 1 && (
                  <motion.p
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.22, delay: 0.18 }}
                    className="font-mono text-xs text-[var(--color-fg-muted)] mt-1"
                  >
                    🔥 {userAfter.streak} day streak
                  </motion.p>
                )}
              </div>
            )}

            {unlocked.length > 0 && (
              <>
                <div
                  className="h-px my-4"
                  style={{ background: "var(--color-border)" }}
                />
                <motion.p
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.22, delay: 0.26 }}
                  className="text-[13px] font-semibold"
                  style={{ color: "var(--color-success)" }}
                >
                  Unlocked: {unlocked.map((n) => n.title).join(", ")}
                </motion.p>
              </>
            )}

            {isGuest && (
              <p className="mt-5 text-xs text-[var(--color-fg-muted)]">
                <Link
                  href="/auth/sign-in"
                  className="font-semibold text-[var(--color-brand-text)]"
                >
                  Sign in
                </Link>{" "}
                to save your progress
              </p>
            )}

            {onContinue ? (
              <Button
                onClick={onContinue}
                className="mt-7 rounded-full font-bold px-10"
              >
                Continue
              </Button>
            ) : (
              <Button asChild className="mt-7 rounded-full font-bold px-10">
                <Link href="/learn">Continue</Link>
              </Button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              variants={{
                initial: (dir: number) => ({ opacity: 0, y: dir * 24 }),
                animate: { opacity: 1, y: 0 },
                exit: (dir: number) => ({ opacity: 0, y: dir * -24 }),
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
              role={isQuiz ? undefined : "button"}
              tabIndex={isQuiz ? undefined : 0}
              onClick={handleCardClick}
              onKeyDown={(e) => {
                if (isQuiz) return;
                if (
                  e.key === "Enter" ||
                  e.key === " " ||
                  e.key === "ArrowRight"
                ) {
                  e.preventDefault();
                  handleCardClick();
                }
                if (
                  (e.key === "ArrowLeft" || e.key === "Backspace") &&
                  index > 0
                ) {
                  e.preventDefault();
                  goBack();
                }
              }}
              drag={isQuiz ? false : "y"}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.3, bottom: 0.3 }}
              onDragEnd={(_, info) => {
                if (info.offset.y < -60 || info.velocity.y < -300) advance();
                else if (
                  index > 0 &&
                  (info.offset.y > 60 || info.velocity.y > 300)
                )
                  goBack();
              }}
              className="w-full rounded-3xl p-8 lg:p-12 text-left flex flex-col lg:min-h-[280px]"
              style={{
                background: cardBg,
                border: cardBorder,
                cursor: isQuiz ? "default" : "pointer",
                boxShadow: isDark
                  ? "0 16px 40px -16px rgba(0,0,0,0.45)"
                  : "0 14px 38px -16px rgba(120,92,52,0.32)",
              }}
            >
              {/* ── Card type label ── */}
              {isMisconception ? (
                <div
                  className="mb-5 pb-4"
                  style={{ borderBottom: "1px solid rgba(200,60,60,0.2)" }}
                >
                  <p
                    className="text-[12px] font-semibold"
                    style={{ color: "rgba(200,60,60,0.85)" }}
                  >
                    ✗ Myth
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-fg-muted)" }}>
                    This is a common misconception — swipe to see why
                  </p>
                </div>
              ) : (
                <p
                  className="font-mono text-[10px] tracking-[0.14em] uppercase mb-4"
                  style={{ color: labelColor }}
                >
                  {isPretest ? "predict" : card.type}
                </p>
              )}

              {/* ── Card body (type-specific) ── */}
              {isQuiz ? (
                <QuizCard
                  card={card}
                  isPretest={isPretest}
                  onAnswered={(correct, latencyMs) => {
                    // Score and record each quiz index at most once — a revisited
                    // quiz (reached via the back control) remounts unanswered and
                    // can be answered again, but must not double-count.
                    if (!scoredRef.current.has(index)) {
                      scoredRef.current.add(index);
                      // Story 10.5: capture this question's difficulty outcome
                      // (pretests included, flagged). Telemetry only — the pretest
                      // XP-exclusion below is byte-unchanged.
                      outcomesRef.current.push({
                        conceptId: concept.id,
                        lessonId: lesson.id,
                        questionId: questionId(card.question),
                        correct,
                        isPretest,
                        latencyMs,
                        surface: "lesson",
                      });
                      // Pretests never move XP (Story 10.1 AC5) — they're a guess
                      // before learning, not a post-learning knowledge check.
                      if (correct && !isPretest) setCorrectCount((c) => c + 1);
                    }
                    advance();
                  }}
                />
              ) : isDialogue ? (
                <DialogueCard body={(card as { body: string }).body} />
              ) : card.type === "stat" ? (
                <StatVisual card={card as StatCard} />
              ) : card.type === "compare" ? (
                <CompareVisual card={card as CompareCard} />
              ) : card.type === "flow" ? (
                <FlowVisual card={card as FlowCard} />
              ) : card.type === "diagram" ? (
                <DiagramVisual card={card as DiagramCard} />
              ) : card.type === "chart" ? (
                <ChartVisual card={card as ChartCard} />
              ) : (
                <>
                  {/* Blur overlay on insight cards until tapped */}
                  <div
                    style={{
                      filter:
                        isInsight && !isRevealed ? "blur(10px)" : "blur(0)",
                      transition: "filter 0.5s ease",
                      userSelect:
                        isInsight && !isRevealed ? "none" : undefined,
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      color: inkColor,
                    }}
                  >
                    {(card as { headline?: string }).headline && (
                      <p
                        className="font-display font-bold text-[24px] leading-snug mb-2"
                        style={{ color: inkColor }}
                      >
                        {(card as { headline?: string }).headline}
                      </p>
                    )}
                    <RichText
                      text={(card as { body: string }).body}
                      dark={isDark}
                      className={`leading-relaxed ${(card as { headline?: string }).headline ? "text-[16px]" : "text-[19px]"}`}
                    />
                  </div>

                  {isInsight && !isRevealed && (
                    <p
                      className="font-mono text-[11px] text-center mt-4"
                      style={{ color: labelColor, opacity: 0.6 }}
                    >
                      tap to reveal
                    </p>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── Persistent back control ── always present (but hidden on the first
          card and the completion screen) so going back a card is a single,
          obvious tap on every card type — including quizzes, where swipe and
          the old inline hint were unavailable. */}
      {!showCompletion && (
        <footer className="shrink-0 flex justify-center px-5 pb-6">
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0}
            aria-label="Previous card"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-0 disabled:pointer-events-none"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-fg-muted)",
            }}
          >
            ← Previous card
          </button>
        </footer>
      )}
      </main>
    </MapShell>
    </GlossaryControlContext.Provider>
    </GlossaryContext.Provider>
  );
}
