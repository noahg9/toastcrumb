"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredUserId, getUser } from "@/lib/api";
import type { Concept, User } from "@toastcrumb/types";

function DiffDots({
  difficulty,
  active,
}: {
  difficulty: number;
  active?: boolean;
}) {
  return (
    <div className="flex gap-[3px] items-center shrink-0">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="inline-block w-[5px] h-[5px] rounded-full transition-colors"
          style={{
            background:
              i <= difficulty
                ? active
                  ? "var(--color-brand)"
                  : "var(--color-fg-muted)"
                : "var(--color-border)",
          }}
        />
      ))}
    </div>
  );
}

export function HomeConcepts({ concepts }: { concepts: Concept[] }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = getStoredUserId();
    if (!stored) return;
    getUser(stored)
      .then(setUser)
      .catch(() => {
        /* silent — graceful degradation */
      });
  }, []);

  const remaining = user
    ? concepts.filter((c) => !user.completedConcepts.includes(c.id))
    : concepts;
  const primary = remaining[0] ?? concepts[0];
  const allCaughtUp = user != null && remaining.length === 0;

  return (
    <div className="grid gap-7 md:grid-cols-[360px_1fr]">

      {/* ── Left column: primary action + graph link ── */}
      <div className="flex flex-col gap-3">
        {primary && (
          <Link
            href={`/lesson/${primary.id}`}
            className="block rounded-[20px] px-5 py-[22px] relative overflow-hidden transition-transform active:scale-[0.98]"
            style={{
              background: "var(--color-brand-bg)",
              border: "1px solid var(--color-brand-ring)",
              borderLeftWidth: "3px",
              borderLeftColor: "var(--color-brand)",
            }}
          >
            {/* Ambient glow from the accent border */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-6 -left-4 w-44 h-44 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,180,84,0.09) 0%, transparent 65%)",
              }}
            />
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)] mb-2.5">
              {allCaughtUp ? "All caught up" : "Continue"}
            </p>
            <p className="text-[22px] font-bold tracking-tight leading-[1.2] text-[var(--color-ink)] mb-1.5">
              {primary.title}
            </p>
            <p className="text-[13px] leading-[1.55] text-[var(--color-fg-muted)] mb-[18px]">
              {allCaughtUp
                ? "You've finished every concept — revisit one anytime."
                : primary.description}
            </p>
            {!allCaughtUp && (
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="inline-block w-[6px] h-[6px] rounded-full"
                    style={{
                      background:
                        i === 1
                          ? "var(--color-brand)"
                          : "rgba(255,180,84,0.2)",
                    }}
                  />
                ))}
                <span className="font-mono text-[10px] text-[var(--color-fg-muted-2)] ml-1.5">
                  lesson 1 of {concepts.length}
                </span>
              </div>
            )}
          </Link>
        )}

        <Link
          href="/graph"
          className="flex items-center justify-between rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3 text-[13px] text-[var(--color-fg-muted-2)] transition-colors hover:text-[var(--color-fg-muted)]"
        >
          <span>Explore concept graph</span>
          <span>→</span>
        </Link>
      </div>

      {/* ── Right column: concepts list ── */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-fg-muted-2)] mb-2.5">
          Concepts
        </p>
        <ul className="flex flex-col gap-1">
          {concepts.map((c) => {
            const done = user?.completedConcepts.includes(c.id) ?? false;
            const active = c.id === primary?.id && !allCaughtUp;
            return (
              <li key={c.id}>
                <Link
                  href={`/lesson/${c.id}`}
                  className="flex items-center justify-between rounded-[13px] px-[14px] py-[11px] border transition-colors active:scale-[0.98]"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: active
                      ? "var(--color-brand-ring)"
                      : "var(--color-border)",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] w-4 text-center text-[var(--color-brand-text)] shrink-0">
                      {done ? "✓" : active ? "›" : ""}
                    </span>
                    <span
                      className="text-sm truncate"
                      style={{
                        color: done
                          ? "var(--color-fg-muted-2)"
                          : "var(--color-ink)",
                      }}
                    >
                      {c.title}
                    </span>
                  </div>
                  <DiffDots difficulty={c.difficulty} active={active} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

    </div>
  );
}
