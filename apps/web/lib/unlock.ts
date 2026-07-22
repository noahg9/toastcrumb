import type { ConceptGraph, GraphNode } from "./graph";

// Pure progressive-unlock model. Given the 5.1 ConceptGraph + a user's
// completedConcepts, it derives each node's status, the reverse-adjacency
// relation (deferred from 5.1), and a "what just opened up" diff.
//
// Like graph.ts this module is intentionally I/O-free (no node:fs, no
// process.cwd(), no module-level mutable state, no React) so Story 5.3's
// "use client" graph view can import it without dragging server-only modules
// into the client bundle. Unlock state is derived at runtime, never persisted.
// [Source: docs/CONCEPT_GRAPH.md "Nodes unlock progressively"; docs/GAME_LOOP.md#Feedback-loops]

export type NodeStatus = "completed" | "available" | "locked";

export interface UnlockState {
  byId: Record<string, NodeStatus>;
  completed: string[];
  available: string[];
  locked: string[];
}

// A node is available when it is not yet completed and *every* prerequisite is
// complete. Gating is on `prerequisites` (the unlock edge), never `next` (the
// recommended-next edge) — see Dev Notes "Unlock gates on `prerequisites`".
// Entry nodes (prerequisites: []) satisfy `[].every(...) === true` from the start.
const isAvailable = (node: GraphNode, completed: Set<string>): boolean =>
  !completed.has(node.id) && node.prerequisites.every((p) => completed.has(p));

/**
 * Derive each node's status from the graph + the user's completed set.
 * Precedence completed > available > locked. Pure and deterministic.
 *
 * The three id arrays partition graph.nodes (every node id in exactly one),
 * each in graph.nodes order (the 5.1 deterministic sort — never re-sorted here).
 * Unknown ids in `completedConcepts` are ignored: they match no node so they
 * never appear in any output array (and since 5.1 guarantees prerequisites are
 * known node ids, they cannot gate anything either).
 */
export function deriveUnlockState(
  graph: ConceptGraph,
  completedConcepts: string[],
): UnlockState {
  const completedSet = new Set(completedConcepts);
  const byId: Record<string, NodeStatus> = {};
  const completed: string[] = [];
  const available: string[] = [];
  const locked: string[] = [];

  for (const node of graph.nodes) {
    const status: NodeStatus = completedSet.has(node.id)
      ? "completed"
      : isAvailable(node, completedSet)
        ? "available"
        : "locked";
    byId[node.id] = status;
    (status === "completed" ? completed : status === "available" ? available : locked).push(node.id);
  }

  return { byId, completed, available, locked };
}

/**
 * Reverse adjacency: the nodes that list `id` among their prerequisites — the
 * structural "what completing `id` contributes to unlocking" (the inverse of
 * the prerequisite edge). Static (no user state). graph.nodes order preserved;
 * an unknown id returns []; total, never throws. One hop only — not transitive.
 */
export function dependents(graph: ConceptGraph, id: string): GraphNode[] {
  return graph.nodes.filter((n) => n.prerequisites.includes(id));
}

/**
 * The feedback-loop diff: nodes that are available under `after` but were not
 * available under `before` — the concepts that *just opened up* because a
 * prerequisite was completed. Pure; graph.nodes order preserved. Excludes the
 * just-completed concept (it becomes completed, not available) and any sibling
 * already available; returns [] when nothing newly opened.
 */
export function newlyUnlocked(
  graph: ConceptGraph,
  before: string[],
  after: string[],
): GraphNode[] {
  const availableSet = (completedConcepts: string[]): Set<string> => {
    const completed = new Set(completedConcepts);
    return new Set(graph.nodes.filter((n) => isAvailable(n, completed)).map((n) => n.id));
  };
  const a = availableSet(after);
  const b = availableSet(before);
  return graph.nodes.filter((n) => a.has(n.id) && !b.has(n.id));
}
