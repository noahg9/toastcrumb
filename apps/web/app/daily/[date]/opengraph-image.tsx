import {
  classifyDailyDate,
  dailyChallengeNumber,
  getDailyChallenge,
  humanDailyDate,
  parseDailyDateKey,
} from "@/lib/daily";
import { OG_CONTENT_TYPE, OG_SIZE, renderDailyOg } from "@/lib/og-daily";

// nodejs required: getDailyChallenge transitively reads node:fs (content.ts).
export const runtime = "nodejs";
// This route's output depends on `date` classified against the CURRENT day
// (today/future/past), not just the `date` param — so the same URL can render
// different content on different days (e.g. a generic fallback while "today",
// then the real per-day card once it's "past"). next/og's file convention
// defaults to a long immutable Cache-Control regardless of `dynamic`, which
// would let a CDN/crawler that caches this URL while "today" keep serving that
// stale render long after the day becomes "past". Force a fresh render every
// request so the response always matches the date's current classification.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "ToastCrumb Daily Challenge";

export default async function Image({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  // Mirror the page's guard: only a valid PAST day gets a per-day image; for
  // today/future/malformed render a safe generic card (no leak of a future day).
  if (classifyDailyDate(date, new Date()) !== "past") {
    return renderDailyOg({
      eyebrow: "TOASTCRUMB DAILY",
      heading: "Daily Challenge",
      tagline: "One scenario. One answer.",
      // This URL's classification (today/future/malformed vs. past) depends on
      // the CURRENT day, not just the date param — the same URL renders this
      // generic card today and the real per-day card once it's "past". Don't
      // let next/og's default year-long immutable cache freeze this render in.
      cacheControl: "public, max-age=0, must-revalidate",
    });
  }

  const parsed = parseDailyDateKey(date)!;
  const challenge = await getDailyChallenge(parsed);
  // An empty/failed content pool means the page body will notFound() below —
  // fall back to the generic card instead of an image for a URL that 404s.
  if (!challenge) {
    return renderDailyOg({
      eyebrow: "TOASTCRUMB DAILY",
      heading: "Daily Challenge",
      tagline: "One scenario. One answer.",
      cacheControl: "public, max-age=0, must-revalidate",
    });
  }

  return renderDailyOg({
    eyebrow: "TOASTCRUMB DAILY",
    heading: `Daily #${dailyChallengeNumber(parsed)}`,
    subheading: humanDailyDate(date),
    concept: challenge.conceptTitle,
    tagline: "One scenario. One answer.",
  });
}
