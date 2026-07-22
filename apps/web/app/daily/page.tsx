import type { Metadata } from "next";
import {
  challengeDateKey,
  dailyChallengeNumber,
  getDailyChallenge,
} from "@/lib/daily";
import { getBaseUrl } from "@/lib/base-url";
import { DailyChallenge } from "./DailyChallenge";

// Per-day metadata (Story 8.5): title/description/OG/twitter/canonical track the
// current UTC day. Runs server-side, so it may import the server-only @/lib/daily.
// The co-located opengraph-image.tsx injects og:image/twitter:image automatically.
export async function generateMetadata(): Promise<Metadata> {
  const now = new Date();
  const challengeNumber = dailyChallengeNumber(now);
  const challenge = await getDailyChallenge(now);
  const canonical = `${getBaseUrl()}/daily`;
  const title = `Daily #${challengeNumber}`;
  // Naming the concept topic (never the answer) is spoiler-free and consistent
  // with the public archive listing (owner decision, Story 8.5 Open Q1).
  const description = challenge?.conceptTitle
    ? `Today's engineering-judgment challenge on ${challenge.conceptTitle} — one scenario, one answer. Play free, no account needed.`
    : "Today's engineering-judgment challenge — one scenario, one answer. Play free, no account needed. A new puzzle every day.";
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

// Recompute per request so the served challenge tracks the current UTC day
// (getDailyChallenge selects by UTC calendar day — Story 8.1).
export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const now = new Date();
  const challenge = await getDailyChallenge(now);
  // Shared with getDailyChallenge's day math so the once-per-day localStorage
  // lock and the shown challenge never desync.
  const challengeDate = challengeDateKey(now);
  // Day-math + base-url both resolved server-side; the "use client" component
  // receives plain values and never imports the server-only daily.ts (Story 8.3).
  const challengeNumber = dailyChallengeNumber(now);
  const shareUrl = `${getBaseUrl()}/daily`;

  return (
    <DailyChallenge
      challenge={challenge}
      challengeDate={challengeDate}
      challengeNumber={challengeNumber}
      shareUrl={shareUrl}
      // Only the canonical today page shows + shares the streak (AC 6).
      enableStreak
    />
  );
}
