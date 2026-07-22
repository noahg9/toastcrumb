import type { Metadata } from "next";
import { getConceptGraph, getAllConcepts } from "@/lib/content";
import { SessionPlayer } from "./SessionPlayer";

// The daily session is a per-user, app-internal surface (its composition is
// dynamic user state), not indexable content — keep it out of the index while
// still reachable by URL. Mirrors /review's robots posture.
export const metadata: Metadata = {
  title: "Daily session",
  robots: { index: false, follow: false },
};

// No `[param]` segment — the session is inherently per-user and composed
// client-side, so this server component only loads the static content (graph +
// all concepts) and hands it to the client SessionPlayer. Mirrors learn/page.tsx.
export default async function SessionPage() {
  const graph = await getConceptGraph();
  const concepts = await getAllConcepts();
  return <SessionPlayer graph={graph} concepts={concepts} />;
}
