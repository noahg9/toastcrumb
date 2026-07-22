import Link from "next/link";
import { getAllConcepts } from "@/lib/content";
import { LandingSignIn } from "./LandingSignIn";
import { MapShell } from "@/components/MapShell";

// A short line of breadcrumbs — the trail motif carried over from the map.
function CrumbRule() {
  return (
    <svg aria-hidden width="64" height="6" className="mb-5">
      <line
        x1="3" y1="3" x2="61" y2="3"
        stroke="var(--tc-trail)" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 11"
      />
    </svg>
  );
}

// The curriculum's high-level domains (tracks) — not individual concepts.
// Keys are lowercase to match Concept.domain. Which of these are live is
// derived from the content on disk; the rest render as "soon". Add a key here
// when a new track is planned; it lights up automatically once concepts exist.
const DOMAINS: { key: string; label: string }[] = [
  { key: "caching", label: "Caching" },
  { key: "networking", label: "Networking" },
  { key: "databases", label: "Databases" },
  { key: "concurrency", label: "Concurrency" },
  { key: "distributed-systems", label: "Distributed systems" },
  { key: "operating-systems", label: "Operating systems" },
  { key: "data-structures", label: "Data structures" },
  { key: "algorithms", label: "Algorithms" },
  { key: "system-design", label: "System design" },
  { key: "security", label: "Security" },
  { key: "observability", label: "Observability" },
  { key: "apis", label: "APIs" },
];

function LessonPreviewCard() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeftWidth: "4px",
        borderLeftColor: "var(--color-brand)",
        boxShadow:
          "0 16px 48px rgba(120,92,52,0.14), 0 2px 8px rgba(120,92,52,0.08)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -left-6 w-56 h-56 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,180,84,0.10) 0%, transparent 65%)",
        }}
      />

      <div className="relative p-6">
        <div className="flex items-center justify-between mb-5">
          <span
            className="font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1 rounded-full"
            style={{
              background: "var(--color-brand-bg)",
              color: "var(--color-brand-text)",
              border: "1px solid var(--color-brand-ring)",
            }}
          >
            Caching
          </span>
          <span
            className="font-mono text-[10px]"
            style={{ color: "var(--color-fg-muted-2)" }}
          >
            insight · card 4 of 9
          </span>
        </div>

        <p
          className="font-mono text-[10px] tracking-[0.14em] uppercase mb-2"
          style={{ color: "var(--color-fg-muted-2)" }}
        >
          The insight
        </p>
        <h3
          className={`font-display text-[22px] font-bold leading-tight mb-4`}
          style={{ color: "var(--color-ink)" }}
        >
          Compute once,<br />serve forever
        </h3>

        <div className="h-px mb-4" style={{ background: "var(--color-border)" }} />

        <p
          className="text-[13px] leading-[1.65] mb-6"
          style={{ color: "var(--color-fg-muted)" }}
        >
          A cache stores the result of expensive work so the next request gets
          a fast copy. No database trip needed.
        </p>

        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <span
              key={i}
              className="inline-block h-[3px] rounded-full flex-shrink-0"
              style={{
                width: "10px",
                background:
                  i < 4 ? "var(--color-brand)" : "var(--color-border)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const concepts = await getAllConcepts();
  const liveDomains = new Set(concepts.map((c) => c.domain).filter(Boolean));

  return (
    <MapShell className="flex flex-col">

      {/* Nav */}
      <header
        className="sticky top-0 z-50 flex items-center h-[58px] px-5 sm:px-10 gap-4 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--color-border)",
          background: "rgba(246,232,202,0.85)",
        }}
      >
        <span
          className="font-display text-lg font-bold tracking-tight"
          style={{ color: "var(--tc-ink)" }}
        >
          ToastCrumb
        </span>
        <div className="flex-1" />
        <LandingSignIn />
        <Link
          href="/learn"
          className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "var(--color-brand)", color: "#3d2200" }}
        >
          Start learning
        </Link>
      </header>

      <main className="flex-1">

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-5 sm:px-10 pt-20 pb-16">
          <div className="grid md:grid-cols-[1fr_300px] gap-12 lg:gap-20 items-center">

            <div>
              <p
                className="font-mono text-[11px] tracking-[0.18em] uppercase mb-4"
                style={{ color: "var(--color-brand-text)" }}
              >
                caching · networking
              </p>
              <CrumbRule />
              <h1
                className={`font-display text-[52px] sm:text-[64px] font-bold leading-[1.02] tracking-tight mb-6`}
                style={{ color: "var(--tc-ink)" }}
              >
                Build software<br />engineering<br />intuition.
              </h1>
              <p
                className="text-lg leading-relaxed mb-10 max-w-[400px]"
                style={{ color: "var(--tc-ink-soft)" }}
              >
                Short lessons on how the systems you use every day actually work.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/learn"
                  className="inline-flex items-center gap-1.5 px-6 py-[11px] rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "var(--color-brand)", color: "#3d2200" }}
                >
                  Start learning →
                </Link>
                <span className="text-sm" style={{ color: "var(--tc-ink-mute)" }}>
                  Free · {concepts.length} concepts
                </span>
              </div>
            </div>

            <div className="hidden md:block">
              <LessonPreviewCard />
            </div>

          </div>
        </section>

        {/* Domain marquee — two copies scroll seamlessly (see .tc-marquee) */}
        <div
          className="tc-marquee relative overflow-hidden border-t border-b py-4"
          style={{
            borderColor: "var(--color-border)",
            maskImage:
              "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
          }}
        >
          <div className="tc-marquee-track flex w-max">
            {[0, 1].map((copy) =>
              DOMAINS.map((d) => {
                const live = liveDomains.has(d.key);
                const base =
                  "inline-flex items-center gap-2 mr-2.5 shrink-0 font-mono text-[11px] px-3.5 py-1.5 rounded-full border whitespace-nowrap";
                const dot = (
                  <span
                    aria-hidden
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: live
                        ? "var(--color-brand)"
                        : "var(--color-fg-muted-2)",
                      opacity: live ? 1 : 0.45,
                    }}
                  />
                );
                return live ? (
                  <Link
                    key={`${copy}-${d.key}`}
                    href="/learn"
                    aria-hidden={copy === 1}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className={`${base} border-[var(--color-brand-ring)] text-[var(--color-brand-text)] bg-[var(--color-brand-bg)] transition-opacity hover:opacity-80`}
                  >
                    {dot}
                    {d.label}
                  </Link>
                ) : (
                  <span
                    key={`${copy}-${d.key}`}
                    aria-hidden={copy === 1}
                    className={`${base} border-[var(--color-border)] text-[var(--tc-ink-mute)] bg-[rgba(251,243,221,0.5)]`}
                  >
                    {dot}
                    {d.label}
                  </span>
                );
              }),
            )}
          </div>
        </div>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-5 sm:px-10 py-20">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-14">
            {[
              {
                title: "Real scenarios",
                body: "Every lesson starts with a situation you recognize. You understand why the concept matters before you learn the name.",
              },
              {
                title: "One concept",
                body: "No checklists, no overviews. Each lesson covers one thing until it clicks.",
              },
              {
                title: "Unlock as you go",
                body: "Finish a lesson and the concepts that build on it open up.",
              },
            ].map(({ title, body }) => (
              <div key={title}>
                <h3
                  className={`font-display text-lg font-semibold mb-3`}
                  style={{ color: "var(--tc-ink)" }}
                >
                  {title}
                </h3>
                <p
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--tc-ink-soft)" }}
                >
                  {body}
                </p>
              </div>
            ))}

            {/* Editorial-gate value-prop (Story 10.7) — links to the full posture. */}
            <Link href="/how-its-made" className="group block">
              <h3
                className="font-display text-lg font-semibold mb-3 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                style={{ color: "var(--tc-ink)" }}
              >
                Curated, not auto-published →
              </h3>
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--tc-ink-soft)" }}
              >
                Lessons are drafted by AI, then graded by a stronger model and
                curated by a human. Only the best few per concept ship.
              </p>
            </Link>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer
        className="border-t px-5 sm:px-10 py-6 flex items-center justify-between gap-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="font-display text-xs" style={{ color: "var(--tc-ink-mute)" }}>
          ToastCrumb
        </span>
        <Link
          href="/how-its-made"
          className="text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ color: "var(--color-brand-text)" }}
        >
          How it&apos;s made
        </Link>
      </footer>

    </MapShell>
  );
}
