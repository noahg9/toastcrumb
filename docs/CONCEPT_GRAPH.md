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

## Published export

The graph is also published as a standalone artifact in this repo:

- `graph/graph.json` — machine-readable: `id`, `title`, `description`, `difficulty`, `domain`,
  `prerequisites`, `next` per concept, plus a `version` and a `$schema` marker.
- `graph/GRAPH.md` — human-readable: one Mermaid `flowchart LR` per domain and a table of every
  concept.

Both are **generated, never hand-edited** — produced by `content:export-graph` in the private
content repo (which owns the full library) and copied here verbatim under this repo's manual
sync policy (`ARCHITECTURE.md` → "This repo's role and sync policy"). The generator builds the
graph with the same `buildGraph` the app uses, so the published map and the in-app map cannot
drift. Output is deterministic — identical content in, byte-identical files out — and a
staleness check in the private repo's CI fails if a concept changes without a re-export.

The export covers **all** concepts even though `content/concepts/` here is a sample set; lesson
content is deliberately excluded.

## The feeling to preserve

> "Everything is connected, and I can see where I'm going."
