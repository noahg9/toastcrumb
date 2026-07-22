import type { MetadataRoute } from "next";
import { getAllConcepts } from "@/lib/content";
import { challengeDateKey, getDailyArchive } from "@/lib/daily";
import { getBaseUrl } from "@/lib/base-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();
  const now = new Date();
  const [concepts, archive] = await Promise.all([
    getAllConcepts(),
    getDailyArchive(now),
  ]);

  // Individual past /daily/[date] pages (Story 8.5, owner Open Q2: include them).
  // Low priority + a self-referential canonical (set in [date]/page.tsx) because
  // many dates map to the same challenge via the modulo pool — otherwise they'd
  // read as duplicate content. Today's key is excluded: /daily/[date] redirects
  // today → /daily, so listing it would advertise a redirect.
  const todayKey = challengeDateKey(now);
  const datedEntries = archive.entries
    .filter((entry) => entry.date !== todayKey)
    .map((entry) => ({
      url: `${base}/daily/${entry.date}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    }));

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/learn`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/how-its-made`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/daily`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/daily/archive`, changeFrequency: "daily", priority: 0.6 },
    ...concepts.map((c) => ({
      url: `${base}/lesson/${c.id}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...datedEntries,
  ];
}
