# Concept Graph

Concepts form a directed graph. The graph *is* the `prerequisites[]` and `next[]` arrays on
each `Concept` — there is no separate graph structure to maintain.

## Structure

Each concept points backward to what should be learned first (`prerequisites`) and forward
to where to go next (`next`). Together these edges form a learning map, e.g.:

```
ip-addressing → dns → http → tls → http2
cache → cache-hit-miss → { cache-eviction, cache-aside }
```

The web app derives the full graph at runtime from the concept files (`lib/graph.ts`); it
is never persisted.

## Navigation

- **Recommended next** — a concept's `next[]` edges
- **Prerequisites** — what unlocks it
- **Free exploration** — the learner can browse the graph directly

## Behavior

- The visible graph grows as the learner progresses.
- Nodes unlock progressively as their prerequisites are completed.
- Completed, available, and locked nodes are visually distinct.

## The feeling to preserve

> "Everything is connected, and I can see where I'm going."
