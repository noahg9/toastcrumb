import type { Metadata } from "next";
import Link from "next/link";
import { challengeDateKey, getDailyArchive, humanDailyDate } from "@/lib/daily";
import { getBaseUrl } from "@/lib/base-url";
import { ArchiveRowStatus } from "./ArchiveRowStatus";
import { MapShell } from "@/components/MapShell";

const description =
  "Browse past ToastCrumb daily challenges and catch up on any day you missed. Free, no account needed.";
const canonical = `${getBaseUrl()}/daily/archive`;

export const metadata: Metadata = {
  title: "Daily Archive",
  description,
  openGraph: {
    title: "Daily Archive | ToastCrumb",
    description,
    url: canonical,
    type: "website",
  },
  // The co-located opengraph-image.tsx supplies the large card image.
  twitter: {
    card: "summary_large_image",
    title: "Daily Archive | ToastCrumb",
    description,
  },
  alternates: { canonical },
};

// The window's start (max(EPOCH_DAY, today − cap)) and today's row both depend on
// the current UTC day, so recompute per request (parity with /daily).
export const dynamic = "force-dynamic";

const container =
  "mx-auto flex min-h-dvh w-full max-w-[600px] lg:max-w-[760px] flex-col";

export default async function DailyArchivePage() {
  const now = new Date();
  const { entries, truncated, cap } = await getDailyArchive(now);
  const todayKey = challengeDateKey(now);

  return (
    <MapShell>
    <main className={`relative ${container}`}>
      <header className="flex items-center justify-between px-5 py-3 shrink-0">
        <Link
          href="/daily"
          className="text-sm font-semibold text-[var(--color-brand-text)]"
        >
          ← Today
        </Link>
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--color-brand-text)]">
          Daily Archive
        </span>
      </header>

      <div className="flex flex-1 flex-col px-5 py-6 lg:py-10">
        <h1 className="font-display text-[22px] font-bold tracking-tight mb-1" style={{ color: "var(--tc-ink)" }}>
          Past challenges
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)] mb-6">
          Catch up on any day you missed — playing a past day counts toward your
          streak.
        </p>

        {entries.length === 0 ? (
          <div
            className="w-full rounded-3xl p-8 text-center"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p className="text-[17px] font-semibold text-[var(--color-ink)] mb-2">
              No challenges yet
            </p>
            <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed">
              Check back soon — a new daily challenge is on the way.
            </p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li key={entry.date}>
                  <Link
                    href={`/daily/${entry.date}`}
                    className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-fg-muted)] w-16 shrink-0">
                      #{entry.challengeNumber}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-ink)] truncate">
                        {entry.conceptTitle}
                      </span>
                      <span className="block text-xs text-[var(--color-fg-muted)]">
                        {humanDailyDate(entry.date)}
                      </span>
                    </span>
                    <ArchiveRowStatus date={entry.date} todayKey={todayKey} />
                  </Link>
                </li>
              ))}
            </ul>
            {truncated && (
              <p className="mt-6 text-xs text-[var(--color-fg-muted)] text-center">
                Showing the last {cap} days. Older challenges aren&apos;t listed.
              </p>
            )}
          </>
        )}
      </div>
    </main>
    </MapShell>
  );
}
