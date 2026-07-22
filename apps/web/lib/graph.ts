import type { Concept, Difficulty } from "@toastcrumb/types";

// Pure concept-graph builder. Turns the static content's authored
// `prerequisites`/`next` edges into an in-memory directed graph.
//
// This module is intentionally I/O-free (no node:fs, no globals, no module-
// level mutable state) so a future client component (Story 5.3) can import it
// without dragging server-only modules into the client bundle. The I/O boundary
// stays in lib/content.ts; getConceptGraph bridges the two.
// [Source: docs/CONCEPT_GRAPH.md "Structure"; docs/ARCHITECTURE.md#Frontend]

export interface GraphNode {
  id: string;
  title: string;
  difficulty: Difficulty;
  domain: string;
  prerequisites: string[];
  next: string[];
}

export interface ConceptGraph {
  nodes: GraphNode[];
  byId: Record<string, GraphNode>;
}

/**
 * Build a directed graph from concepts' authored edge arrays.
 *
 * Pure: deterministic and side-effect-free. Edges are recorded literally
 * (the inverse direction is never inferred). Self edges and dangling edges
 * (targets with no matching concept) are dropped, and duplicate targets are
 * de-duped — mirroring the content validator, which treats both as non-fatal
 * warnings. Nodes are sorted by (difficulty asc, then id asc) for stable output
 * regardless of input order.
 */
export function buildGraph(concepts: Concept[]): ConceptGraph {
  const knownIds = new Set(concepts.map((c) => c.id));

  // Drop self edges (target === own id) and dangling edges (target not a known
  // concept), then de-dupe while preserving first-seen order.
  const cleanEdges = (edges: string[], selfId: string): string[] =>
    [...new Set(edges.filter((t) => t !== selfId && knownIds.has(t)))];

  const nodes: GraphNode[] = concepts
    .map((c) => ({
      id: c.id,
      title: c.title,
      difficulty: c.difficulty,
      domain: c.domain ?? "other",
      prerequisites: cleanEdges(c.prerequisites, c.id),
      next: cleanEdges(c.next, c.id),
    }))
    .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return { nodes, byId };
}

/**
 * Resolve a node's edge ids to the actual GraphNodes — the "neighbor concepts"
 * navigation primitive. Returns empty arrays for an unknown id (no throw).
 * Resolved arrays preserve the node's edge order. The resolution filter is
 * defensive: after buildGraph's filtering every edge already resolves.
 */
export function neighbors(
  graph: ConceptGraph,
  id: string,
): { prerequisites: GraphNode[]; next: GraphNode[] } {
  const node = graph.byId[id];
  if (!node) return { prerequisites: [], next: [] };

  const resolve = (ids: string[]): GraphNode[] =>
    ids.map((edgeId) => graph.byId[edgeId]).filter((n): n is GraphNode => Boolean(n));

  return { prerequisites: resolve(node.prerequisites), next: resolve(node.next) };
}

/**
 * Confusable neighbors of a concept — the discrimination-practice primitive
 * behind daily-session interleaving (Story 9.4). Interleaving's evidence is
 * strongest for telling apart *confusable* concepts (cache-aside vs write-
 * through-cache, TCP vs UDP), so the composer needs to know which concepts a
 * learner is likely to conflate. There is no authored `confusable` field in
 * content, so confusability is inferred from graph structure alone:
 *
 *   confusable(id, j)  ⇔  id ≠ j  AND (
 *        j ∈ node.next ∪ node.prerequisites          // id's own edges
 *     OR id ∈ graph.byId[j].next ∪ .prerequisites    // reverse edges (edges are
 *                                                     //   stored literally — the
 *                                                     //   inverse is never inferred)
 *     OR node.prerequisites ∩ graph.byId[j].prerequisites ≠ ∅  // siblings: share a prereq
 *   )
 *
 * i.e. undirected prereq/next adjacency ∪ shared-prerequisite siblings. `domain`
 * is deliberately NOT used (unpopulated in all content → "other" for every node,
 * which would make everything confusable with everything).
 *
 * Pure, deterministic, I/O-free — like `neighbors`. Operates on buildGraph's
 * already-cleaned edges (self/dangling dropped, de-duped), so no re-cleaning is
 * needed. Returns ids (not nodes), self-excluded, de-duped, in stable sorted
 * order (localeCompare, matching this module's convention). Unknown id → `[]`
 * (no throw), mirroring `neighbors`'s defensive contract.
 * [Source: Story 9.4 — owner-resolved confusability model]
 */
export function confusableNeighbors(graph: ConceptGraph, id: string): string[] {
  const node = graph.byId[id];
  if (!node) return [];

  const ownEdges = new Set([...node.next, ...node.prerequisites]);
  const ownPrereqs = new Set(node.prerequisites);

  const result = new Set<string>();
  for (const other of graph.nodes) {
    if (other.id === id) continue;
    const isEdge = ownEdges.has(other.id) || other.next.includes(id) || other.prerequisites.includes(id);
    const isSibling = other.prerequisites.some((p) => ownPrereqs.has(p));
    if (isEdge || isSibling) result.add(other.id);
  }

  return [...result].sort((a, b) => a.localeCompare(b));
}
