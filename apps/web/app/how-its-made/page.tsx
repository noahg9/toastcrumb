import type { Metadata } from "next";
import Link from "next/link";
import { getBaseUrl } from "@/lib/base-url";
import { MapShell } from "@/components/MapShell";

const description =
  "How a ToastCrumb lesson gets made: drafted by AI, judged by a stronger model, and kept only if it passes a strict editorial gate.";
const canonical = `${getBaseUrl()}/how-its-made`;

export const metadata: Metadata = {
  title: "How it's made",
  description,
  openGraph: {
    title: "How it's made | ToastCrumb",
    description,
    url: canonical,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "How it's made | ToastCrumb",
    description,
  },
  alternates: { canonical },
};

// Each step is literally true of the offline pipeline:
//  1. generate-content.ts:54 (claude-sonnet-4-6, offline) + PRODUCT_RULES "no live AI-generated lessons"
//  2. select-content.ts:35-39 (judge = claude-opus-4-8, stronger) + :390-403 (strict rejection rules)
//  3. select-content.ts:45 (MAX_LESSONS_KEPT = 3) + human-run gate (Epic 10 / Story 10.6)
const STEPS: { label: string; title: string; body: string }[] = [
  {
    label: "01 · Draft",
    title: "Drafted offline",
    body: "Every lesson is written ahead of time by Claude Sonnet and saved as static content. Nothing is generated live while you learn.",
  },
  {
    label: "02 · Judge",
    title: "Judged by a stronger model",
    body: "Each draft is scored by a stronger model, Claude Opus, against strict rules: real-world context, technically correct, clear, and not boring.",
  },
  {
    label: "03 · Keep",
    title: "Kept only if it's the best",
    body: "Only the best one to three lessons per concept survive. A human runs the gate, reads what the judge rejects, and regenerates the rest.",
  },
];

const container =
  "mx-auto flex min-h-dvh w-full max-w-[600px] lg:max-w-[720px] flex-col";

export default function HowItsMadePage() {
  return (
    <MapShell>
      <main className={`relative ${container}`}>
        <header className="flex items-center justify-between px-5 py-3 shrink-0">
          <Link
            href="/"
            className="text-sm font-semibold text-[var(--color-brand-text)]"
          >
            ← ToastCrumb
          </Link>
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)]">
            How it&apos;s made
          </span>
        </header>

        <div className="flex flex-1 flex-col px-5 py-8 lg:py-12">
          <h1
            className="font-display text-[30px] sm:text-[36px] font-bold leading-tight tracking-tight mb-4"
            style={{ color: "var(--tc-ink)" }}
          >
            How a ToastCrumb<br />lesson gets made
          </h1>
          <p
            className="text-[15px] leading-relaxed mb-10 max-w-[46ch]"
            style={{ color: "var(--tc-ink-soft)" }}
          >
            AI is a drafting tool here — not the thing you&apos;re buying. Every
            lesson is written offline by one model, judged by a stronger one, and
            kept only if a human agrees it&apos;s good enough. Most drafts don&apos;t make it.
          </p>

          <ol role="list" className="flex flex-col gap-3 mb-10">
            {STEPS.map(({ label, title, body }) => (
              <li
                key={label}
                className="rounded-2xl p-5"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderLeftWidth: "4px",
                  borderLeftColor: "var(--color-brand)",
                }}
              >
                <p
                  className="font-mono text-[10px] tracking-[0.16em] uppercase mb-2"
                  style={{ color: "var(--color-brand-text)" }}
                >
                  {label}
                </p>
                <h2
                  className="font-display text-lg font-semibold mb-1.5"
                  style={{ color: "var(--tc-ink)" }}
                >
                  {title}
                </h2>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--tc-ink-soft)" }}
                >
                  {body}
                </p>
              </li>
            ))}
          </ol>

          <p
            className="font-display text-lg font-semibold mb-8"
            style={{ color: "var(--tc-ink)" }}
          >
            AI drafts. A human decides what&apos;s good enough.
          </p>

          <div>
            <Link
              href="/learn"
              className="inline-flex items-center gap-1.5 px-6 py-[11px] rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ background: "var(--color-brand)", color: "#3d2200" }}
            >
              Start learning →
            </Link>
          </div>
        </div>
      </main>
    </MapShell>
  );
}
