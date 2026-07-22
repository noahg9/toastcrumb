import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConcept, getAllConcepts } from "@/lib/content";
import { ReviewPlayer } from "./ReviewPlayer";

// Reviews are a per-user, app-internal practice surface (not the public
// SEO/indexable content — that's the lesson + daily-challenge pages). Keep them
// out of the index while still letting the route be reached directly by URL.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ conceptId: string }>;
}): Promise<Metadata> {
  const { conceptId } = await params;
  const concept = await getConcept(conceptId);
  if (!concept) return {};
  return {
    title: `Review: ${concept.title}`,
    robots: { index: false, follow: false },
  };
}

export async function generateStaticParams() {
  const concepts = await getAllConcepts();
  // Mirror the notFound() guard below — a concept with no lessons has no
  // reviewable content, so it must not be statically generated (dynamicParams
  // = false would otherwise throw notFound() mid-build for such a concept).
  return concepts
    .filter((c) => c.lessons.length > 0)
    .map((c) => ({ conceptId: c.id }));
}

export const dynamicParams = false;

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ conceptId: string }>;
}) {
  const { conceptId } = await params;
  const concept = await getConcept(conceptId);
  if (!concept || concept.lessons.length === 0) notFound();

  // Pass the FULL concept (all variants) — the client picks a not-recently-seen
  // variant from the per-user `lastVariantId` fetched in ReviewPlayer. The
  // server never reads user state; content stays server-side, selection is
  // web-side and pure (lib/review.ts). Unlike the first-learn flow, we do NOT
  // pre-pick lessons[0] here.
  return <ReviewPlayer concept={concept} />;
}
