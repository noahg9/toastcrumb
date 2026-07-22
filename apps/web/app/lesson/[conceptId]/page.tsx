import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConcept, getAllConcepts, getConceptGraph } from "@/lib/content";
import { LessonPlayer } from "./LessonPlayer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ conceptId: string }>;
}): Promise<Metadata> {
  const { conceptId } = await params;
  const concept = await getConcept(conceptId);
  if (!concept) return {};
  return {
    title: concept.title,
    description: concept.description,
    openGraph: {
      title: `${concept.title} | ToastCrumb`,
      description: concept.description,
    },
  };
}

export async function generateStaticParams() {
  const concepts = await getAllConcepts();
  return concepts.map((c) => ({ conceptId: c.id }));
}

export const dynamicParams = false;

export default async function LessonPage({
  params,
}: {
  params: Promise<{ conceptId: string }>;
}) {
  const { conceptId } = await params;
  const concept = await getConcept(conceptId);
  if (!concept || concept.lessons.length === 0) notFound();

  // The static concept graph (5.1) — passed down so the client player can
  // compute the just-unlocked feedback from server-provided structure + the
  // client-fetched user state. Pure graph; no node:fs reaches the client.
  const graph = await getConceptGraph();

  // V1 plays the first lesson variant (docs/AI_GENERATION_PIPELINE.md selection).
  return <LessonPlayer concept={concept} lesson={concept.lessons[0]} graph={graph} />;
}
