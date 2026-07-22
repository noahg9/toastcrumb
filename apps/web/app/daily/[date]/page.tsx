import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  challengeDateKey,
  classifyDailyDate,
  dailyChallengeNumber,
  getDailyChallenge,
  humanDailyDate,
  parseDailyDateKey,
} from "@/lib/daily";
import { getBaseUrl } from "@/lib/base-url";
import { DailyChallenge } from "../DailyChallenge";

// Per-day metadata (Story 8.5). Runs before the body — so it also sees
// today/future/malformed — and must never throw or leak a future day's info.
// Only a valid PAST day gets rich per-day tags + a self-referential canonical;
// everything else returns a safe minimal object (the body still 404s/redirects).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (classifyDailyDate(date, new Date()) !== "past") {
    return {
      title: "Daily Challenge",
      description:
        "Play or review a past ToastCrumb daily challenge. Free, no account needed.",
    };
  }

  const parsed = parseDailyDateKey(date)!;
  const challenge = await getDailyChallenge(parsed);
  // An empty/failed content pool means the page body will notFound() below —
  // don't emit indexable per-day tags/canonical for a URL that 404s.
  if (!challenge) {
    return {
      title: "Daily Challenge",
      description:
        "Play or review a past ToastCrumb daily challenge. Free, no account needed.",
    };
  }
  const challengeNumber = dailyChallengeNumber(parsed);
  const dateLabel = humanDailyDate(date);
  // Self-referential canonical: many dates map to the same challenge via the
  // modulo pool, so each dated page points at itself to avoid duplicate-content
  // penalties (Story 8.5 AC 4/6).
  const canonical = `${getBaseUrl()}/daily/${date}`;
  const title = `Daily #${challengeNumber} · ${dateLabel}`;
  const description = `The ToastCrumb daily challenge on ${challenge.conceptTitle} from ${dateLabel} — one scenario, one answer. Free, no account needed.`;
  const ogTitle = `${title} | ToastCrumb`;
  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
    },
    alternates: { canonical },
  };
}

// Whether a requested date is future/today/past depends on the current UTC day,
// so this route must recompute per request (parity with /daily).
export const dynamic = "force-dynamic";

export default async function DatedDailyPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const now = new Date();

  switch (classifyDailyDate(date, now)) {
    case "malformed":
    case "pre-epoch":
      notFound();
    // eslint-disable-next-line no-fallthrough -- notFound() throws; unreachable.
    case "future":
    case "today":
      // One canonical URL for today; future days must not leak tomorrow's answer.
      redirect("/daily");
  }

  // classifyDailyDate returned "past" → the key is well-formed and in range.
  const parsed = parseDailyDateKey(date)!;
  const challenge = await getDailyChallenge(parsed);
  if (!challenge) notFound();

  return (
    <DailyChallenge
      challenge={challenge}
      challengeDate={challengeDateKey(parsed)}
      challengeNumber={dailyChallengeNumber(parsed)}
      // Per-day share URLs are Story 8.5; keep the generic /daily link (8.3 canon).
      shareUrl={`${getBaseUrl()}/daily`}
      // No streak on archived days — "current streak" is a today-only concept (AC 6).
      backToToday
    />
  );
}
