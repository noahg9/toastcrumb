"use client";

// Shared rich-text machinery: [[term|def]] glossary annotations + animated
// number count-up. Extracted from LessonPlayer so the lesson player and the
// standalone daily-challenge QuizCard render prose identically (Story 8.2).
//
// GlossaryContext defaults to an empty Map, so RichText/Rich render fine with no
// provider — explicit [[term|def]] markup still renders; only the "make every
// other mention tappable" behavior needs a lesson-level glossary provider.

import { createContext, useContext, useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Lesson } from "@toastcrumb/types";

type Seg =
  | { k: "text"; v: string }
  | { k: "ann"; term: string; def: string }
  | { k: "num"; value: number };

// Lesson-level glossary: term (lowercased) → definition. Built once per lesson
// from every [[term|definition]] annotation across all cards, then used to make
// EVERY mention of a defined term tappable — not only the first, annotated one.
export const GlossaryContext = createContext<Map<string, string>>(new Map());

// Optional controller so the enclosing card can own which glossary popup is open
// (at most one at a time). When a provider is present, tapping a term routes
// through it — letting the card's own click handler *close* an open popup instead
// of advancing. Without a provider (e.g. the standalone daily QuizCard) each Ann
// falls back to purely local open state, so explicit [[term|def]] markup still
// works with no extra wiring.
type GlossaryControl = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};
export const GlossaryControlContext = createContext<GlossaryControl | null>(null);

export function buildGlossary(cards: Lesson["cards"]): Map<string, string> {
  const g = new Map<string, string>();
  const re = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
  const scan = (s?: string) => {
    if (!s) return;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const key = m[1].trim().toLowerCase();
      if (!g.has(key)) g.set(key, m[2].trim());
    }
  };
  for (const c of cards as unknown as Array<Record<string, unknown>>) {
    scan(c.body as string | undefined);
    scan(c.explanation as string | undefined);
    scan(c.context as string | undefined);
    scan(c.headline as string | undefined);
    (c.steps as Array<{ label?: string; detail?: string }> | undefined)?.forEach(
      (s) => {
        scan(s.label);
        scan(s.detail);
      },
    );
    (c.left as { points?: string[] } | undefined)?.points?.forEach(scan);
    (c.right as { points?: string[] } | undefined)?.points?.forEach(scan);
  }
  return g;
}

// One alternation regex per glossary instance, terms longest-first so multi-word
// terms win over their substrings (e.g. "cache miss" before "cache").
const glossaryReCache = new WeakMap<Map<string, string>, RegExp | null>();
function glossaryMatcher(glossary: Map<string, string>): RegExp | null {
  const cached = glossaryReCache.get(glossary);
  if (cached !== undefined) return cached;
  const terms = [...glossary.keys()]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"));
  const re = terms.length ? new RegExp(`\\b(${terms.join("|")})\\b`, "gi") : null;
  glossaryReCache.set(glossary, re);
  return re;
}

// Split a plain-text run into text + glossary-linked annotation segments.
function pushGlossaryText(
  segs: Seg[],
  text: string,
  glossary: Map<string, string>,
) {
  const re = glossaryMatcher(glossary);
  if (!re || !text) {
    if (text) segs.push({ k: "text", v: text });
    return;
  }
  re.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ k: "text", v: text.slice(last, m.index) });
    const def = glossary.get(m[0].toLowerCase());
    segs.push(def ? { k: "ann", term: m[0], def } : { k: "text", v: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ k: "text", v: text.slice(last) });
}

function parseSegs(text: string, glossary: Map<string, string>): Seg[] {
  const segs: Seg[] = [];
  const re = /\[\[([^\]|]+)\|([^\]]+)\]\]|(\b\d[\d,]*(?:\.\d+)?\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      pushGlossaryText(segs, text.slice(last, m.index), glossary);
    if (m[1] && m[2]) {
      segs.push({ k: "ann", term: m[1], def: m[2] });
    } else if (m[3]) {
      const n = parseFloat(m[3].replace(/,/g, ""));
      if (!isNaN(n) && n > 99) segs.push({ k: "num", value: n });
      else segs.push({ k: "text", v: m[3] });
    }
    last = re.lastIndex;
  }
  if (last < text.length) pushGlossaryText(segs, text.slice(last), glossary);
  return segs;
}

export function CountUp({ value }: { value: number }) {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    let raf: number;
    const dur = Math.min(1400, 400 + Math.log10(value + 1) * 250);
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min((performance.now() - t0) / dur, 1);
      setCur(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="font-bold tabular-nums">{cur.toLocaleString()}</span>;
}

function Ann({ term, def, dark }: { term: string; def: string; dark: boolean }) {
  const id = useId();
  const ctrl = useContext(GlossaryControlContext);
  const [localOpen, setLocalOpen] = useState(false);
  // When a card-level controller is present it owns the open state (one popup at
  // a time, and the card can dismiss it); otherwise fall back to local state.
  const open = ctrl ? ctrl.openId === id : localOpen;
  const toggle = () => {
    if (ctrl) ctrl.setOpenId(ctrl.openId === id ? null : id);
    else setLocalOpen((o) => !o);
  };
  return (
    <span className="relative inline">
      <button
        type="button"
        className="underline decoration-dotted underline-offset-2 cursor-help"
        style={{
          textDecorationColor: dark
            ? "rgba(230,237,243,0.45)"
            : "var(--color-fg-muted-2)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {term}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-full left-0 mb-2 z-30 block w-56 rounded-2xl px-3 py-2.5 text-[13px] leading-snug shadow-xl"
            style={{
              background: dark ? "#f4f6f9" : "#0e1520",
              color: dark ? "#0e1520" : "#e6edf3",
              border: "1px solid rgba(128,128,128,0.12)",
            }}
          >
            <strong>{term}:</strong> {def}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function renderSegs(segs: Seg[], dark: boolean) {
  return segs.map((s, i) =>
    s.k === "ann" ? (
      <Ann key={i} term={s.term} def={s.def} dark={dark} />
    ) : s.k === "num" ? (
      <CountUp key={i} value={s.value} />
    ) : (
      <span key={i}>{s.v}</span>
    ),
  );
}

export function RichText({
  text,
  dark,
  className,
}: {
  text: string;
  dark: boolean;
  className?: string;
}) {
  const glossary = useContext(GlossaryContext);
  return <p className={className}>{renderSegs(parseSegs(text, glossary), dark)}</p>;
}

// Inline variant — same rich rendering without the block <p> wrapper, for use
// inside existing elements (stat context, flow/compare/dialogue prose).
export function Rich({ text, dark }: { text: string; dark: boolean }) {
  const glossary = useContext(GlossaryContext);
  return <>{renderSegs(parseSegs(text, glossary), dark)}</>;
}
