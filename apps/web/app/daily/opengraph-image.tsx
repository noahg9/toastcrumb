import {
  challengeDateKey,
  dailyChallengeNumber,
  getDailyChallenge,
  humanDailyDate,
} from "@/lib/daily";
import { OG_CONTENT_TYPE, OG_SIZE, renderDailyOg } from "@/lib/og-daily";

// nodejs required: getDailyChallenge transitively reads node:fs (content.ts),
// which the edge runtime forbids.
export const runtime = "nodejs";
// The card is per-UTC-day (parity with the page's force-dynamic) — never freeze
// it to build time / a stale day.
export const dynamic = "force-dynamic";
// next/og's opengraph-image convention defaults to a long immutable Cache-Control
// regardless of `dynamic` — without an explicit revalidate, a CDN/crawler that
// caches this URL "today" would keep serving today's card long after the day
// (and its correct content) has moved on. Force a fresh render every request.
export const revalidate = 0;

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "ToastCrumb Daily Challenge — a new engineering-judgment puzzle every day";

export default async function Image() {
  const now = new Date();
  const challenge = await getDailyChallenge(now);
  return renderDailyOg({
    eyebrow: "TOASTCRUMB DAILY",
    heading: `Daily #${dailyChallengeNumber(now)}`,
    subheading: humanDailyDate(challengeDateKey(now)),
    // Concept topic is public (Story 8.4 archive); the answer/explanation is not.
    concept: challenge?.conceptTitle,
    tagline: "One scenario. One answer.",
    // This URL's content changes every UTC day — next/og's default year-long
    // immutable cache would let a CDN/crawler keep serving a stale day's card.
    cacheControl: "public, max-age=0, must-revalidate",
  });
}
