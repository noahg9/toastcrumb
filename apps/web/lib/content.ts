import { cache } from "react";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Concept } from "@toastcrumb/types";
import { buildGraph } from "./graph";
import type { ConceptGraph } from "./graph";

// On Vercel, outputFileTracingRoot anchors tracing at the monorepo root and
// cwd at runtime is that root, so content/concepts resolves correctly.
// Locally, cwd is apps/web, so we walk up two levels.
const traced = path.resolve(process.cwd(), "content/concepts");
const CONTENT_DIR = existsSync(traced)
  ? traced
  : path.resolve(process.cwd(), "../../content/concepts");

export async function getAllConcepts(): Promise<Concept[]> {
  let files: string[];
  try {
    files = await readdir(CONTENT_DIR);
  } catch (e) {
    // An absent content dir means "no content yet" (e.g. a clean slate before
    // regeneration) — degrade to an empty set instead of crashing the build.
    // generateStaticParams and sitemap both call this during `next build`.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const concepts = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const raw = await readFile(path.join(CONTENT_DIR, f), "utf8");
        return JSON.parse(raw) as Concept;
      }),
  );
  return concepts.sort((a, b) => a.difficulty - b.difficulty);
}

export const getConcept = cache(async (id: string): Promise<Concept | null> => {
  try {
    const raw = await readFile(path.join(CONTENT_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as Concept;
  } catch {
    return null;
  }
});

// Derived at runtime, never persisted — the single call site Story 5.3 consumes.
// content.ts (server, does I/O) → graph.ts (pure transform).
export async function getConceptGraph(): Promise<ConceptGraph> {
  return buildGraph(await getAllConcepts());
}
