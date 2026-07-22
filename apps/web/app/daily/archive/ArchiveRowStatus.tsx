"use client";

// Story 8.4 — thin client enhancement over the server-rendered archive rows.
// Reads the per-day localStorage lock to badge each listed day as played /
// missed / not-played. It carries NO answer content (spoiler-free) — only the
// fact of whether this visitor has played that date. Read in an effect, never
// during render, so there is no hydration flash (same discipline as the play
// gate). `todayKey` is injected from the server so we can tell "not played yet"
// (today) apart from "missed" (a past day).

import { useEffect, useState } from "react";

// A day counts as "played" only when its stored value parses and matches the
// StoredResult shape — the same definition the play gate and streak use, so the
// three surfaces can't disagree (a corrupt/empty/tampered key is not a play).
function hasPlayed(dateKey: string): boolean {
  try {
    const raw = localStorage.getItem(`toastcrumb_daily_${dateKey}`);
    if (!raw) return false;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return false;
    const r = v as Record<string, unknown>;
    return (
      typeof r.picked === "number" &&
      typeof r.correct === "boolean" &&
      typeof r.answeredAt === "string" &&
      Array.isArray(r.order) &&
      r.order.every((n) => typeof n === "number")
    );
  } catch {
    return false;
  }
}

export function ArchiveRowStatus({
  date,
  todayKey,
}: {
  date: string;
  todayKey: string;
}) {
  // null until the effect resolves the local state (no SSR flash).
  const [status, setStatus] = useState<"played" | "missed" | "unplayed" | null>(
    null,
  );

  useEffect(() => {
    if (hasPlayed(date)) setStatus("played");
    else if (date === todayKey) setStatus("unplayed");
    else setStatus("missed");
  }, [date, todayKey]);

  if (status === null) {
    // Neutral placeholder keeps row height stable before hydration resolves.
    return <span className="text-xs" aria-hidden>&nbsp;</span>;
  }

  const label =
    status === "played"
      ? "Played ✓"
      : status === "missed"
        ? "Missed"
        : "Not played yet";

  const color =
    status === "played"
      ? "var(--color-success-ring)"
      : status === "missed"
        ? "var(--color-fg-muted)"
        : "var(--color-brand-text)";

  return (
    <span className="text-xs font-semibold whitespace-nowrap" style={{ color }}>
      {label}
    </span>
  );
}
