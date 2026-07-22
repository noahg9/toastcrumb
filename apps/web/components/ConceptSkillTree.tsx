"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ConceptGraph, GraphNode } from "@/lib/graph";
import { neighbors } from "@/lib/graph";
import { deriveUnlockState } from "@/lib/unlock";
import type { NodeStatus, UnlockState } from "@/lib/unlock";
import { deriveMastery } from "@/lib/mastery";
import type { MasteryInfo, MasteryState } from "@/lib/mastery";
import { getStoredUserId, getUser, getAllReviews } from "@/lib/api";
import type { ReviewState, User } from "@toastcrumb/types";
import { cn } from "@/lib/utils";
import { ContourBackdrop } from "@/components/ContourBackdrop";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_R = 34;       // waypoint radius
const NODE_D = NODE_R * 2;
const COL_W = 210;       // horizontal center-to-center
const ROW_H = 118;       // vertical center-to-center
const TRACK_PAD = 60;    // padding inside each region canvas
const LABEL_W = 120;     // label text width (centered under waypoint)
const BEZIER_CP = 0.62;  // bezier control point as fraction of edge length

// ── Layout types ──────────────────────────────────────────────────────────────

interface SkillNode { id: string; title: string; cx: number; cy: number }
interface SkillEdge { key: string; x1: number; y1: number; x2: number; y2: number }
interface SkillTrack { domain: string; label: string; nodes: SkillNode[]; edges: SkillEdge[]; width: number; height: number }

// ── Layout algorithm ──────────────────────────────────────────────────────────

function computeTracks(graph: ConceptGraph): SkillTrack[] {
  const byDomain = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (!byDomain.has(node.domain)) byDomain.set(node.domain, []);
    byDomain.get(node.domain)!.push(node);
  }

  return [...byDomain.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, nodes]) => {
      // ── Step 1: Column = prerequisite depth ───────────────────────────────
      const depthCache: Record<string, number> = {};
      const depthOf = (id: string, stack: Set<string>): number => {
        if (depthCache[id] !== undefined) return depthCache[id];
        const n = graph.byId[id];
        if (!n || n.prerequisites.length === 0) return (depthCache[id] = 0);
        if (stack.has(id)) return 0;
        stack.add(id);
        const d = 1 + Math.max(...n.prerequisites.map((p) => depthOf(p, stack)));
        stack.delete(id);
        return (depthCache[id] = d);
      };

      // Group node ids by column
      const byCol: string[][] = [];
      for (const node of nodes) {
        const col = depthOf(node.id, new Set());
        while (byCol.length <= col) byCol.push([]);
        byCol[col].push(node.id);
      }

      // ── Step 2: Barycenter row ordering (4 passes) ────────────────────────
      // Floating-point order score per node; converted to integers at the end.
      const order: Record<string, number> = {};
      byCol.forEach((ids, _) => ids.forEach((id, i) => { order[id] = i; }));

      const bc = (id: string, useSuccessors: boolean): number => {
        const n = graph.byId[id];
        if (!n) return order[id] ?? 0;
        const refs = useSuccessors ? n.next : n.prerequisites;
        const valid = refs.filter((r) => order[r] !== undefined);
        if (valid.length === 0) return order[id] ?? 0;
        return valid.reduce((s, r) => s + order[r], 0) / valid.length;
      };

      for (let pass = 0; pass < 4; pass++) {
        const forward = pass % 2 === 0;
        // Forward passes sweep left→right sorting by predecessors' positions;
        // backward passes sweep right→left sorting by successors' positions.
        // Together they center each node on its neighbors, reducing crossings.
        const sweep = forward
          ? byCol.slice(1).map((_, i) => i + 1)
          : byCol.slice(0, -1).map((_, i) => byCol.length - 2 - i);
        for (const col of sweep) {
          const sorted = [...byCol[col]].sort((a, b) => bc(a, !forward) - bc(b, !forward));
          sorted.forEach((id, i) => { order[id] = i; });
          byCol[col] = sorted;
        }
      }

      // ── Step 3: Build integer positions ───────────────────────────────────
      const pos: Record<string, { col: number; row: number }> = {};
      byCol.forEach((ids, col) => ids.forEach((id, row) => { pos[id] = { col, row }; }));

      let maxCol = 0, maxRow = 0;
      for (const { col, row } of Object.values(pos)) {
        maxCol = Math.max(maxCol, col);
        maxRow = Math.max(maxRow, row);
      }

      const cx = (col: number) => TRACK_PAD + col * COL_W;
      const cy = (row: number) => TRACK_PAD + row * ROW_H;

      const skillNodes: SkillNode[] = nodes.map((n) => ({
        id: n.id,
        title: n.title,
        cx: cx(pos[n.id].col),
        cy: cy(pos[n.id].row),
      }));

      const nById = Object.fromEntries(skillNodes.map((n) => [n.id, n]));

      const edges: SkillEdge[] = nodes.flatMap((n) =>
        n.next
          .map((tid) => nById[tid])
          .filter(Boolean)
          .map((to) => ({
            key: `${n.id}--${to.id}`,
            x1: nById[n.id].cx + NODE_R,
            y1: nById[n.id].cy,
            x2: to.cx - NODE_R,
            y2: to.cy,
          })),
      );

      const width = cx(maxCol) + NODE_R + TRACK_PAD;
      const height = cy(maxRow) + NODE_R + TRACK_PAD;
      const label = domain.charAt(0).toUpperCase() + domain.slice(1);

      return { domain, label, nodes: skillNodes, edges, width, height };
    });
}

// ── Fog of war ──────────────────────────────────────────────────────────────
// Locked waypoints are revealed by graph distance from the frontier (completed ∪
// available). "clear" = you can act on it now; "horizon" = one hop ahead, shape
// visible but name blurred until you peek; "fog" = deeper/unreachable, sits under
// the mist as a silhouette. Pure rendering layer over the unlock model — every
// waypoint still exists and stays clickable, so the detail panel keeps working.

type RevealTier = "clear" | "horizon" | "fog";

function computeReveal(graph: ConceptGraph, unlock: UnlockState): Record<string, RevealTier> {
  const tier: Record<string, RevealTier> = {};

  // BFS forward along `next` edges, seeded from the frontier. Distance 0 nodes
  // (completed/available) are "clear"; the first locked hop is "horizon"; any
  // deeper — or never reached — falls to "fog".
  const dist: Record<string, number> = {};
  const queue: string[] = [];
  for (const n of graph.nodes) {
    const s = unlock.byId[n.id] ?? "locked";
    if (s === "completed" || s === "available") {
      dist[n.id] = 0;
      queue.push(n.id);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const n = graph.byId[queue[head]];
    if (!n) continue;
    for (const nx of n.next) {
      if (dist[nx] === undefined) {
        dist[nx] = dist[queue[head]] + 1;
        queue.push(nx);
      }
    }
  }

  for (const n of graph.nodes) {
    const s = unlock.byId[n.id] ?? "locked";
    if (s === "completed" || s === "available") tier[n.id] = "clear";
    else tier[n.id] = dist[n.id] === 1 ? "horizon" : "fog";
  }
  return tier;
}

// ── Cartographic decorations ──────────────────────────────────────────────────

// The tiled contour texture is the shared <ContourBackdrop/>.

// ── SkillNodeCircle (waypoint) ────────────────────────────────────────────────

function SkillNodeCircle({ node, status, reveal, mastery, isRecommended, isSelected, onClick, revealDelay }: {
  node: SkillNode; status: NodeStatus; reveal: RevealTier; mastery?: MasteryInfo; isRecommended: boolean;
  isSelected: boolean; onClick: () => void; revealDelay: number;
}) {
  const isCompleted = status === "completed";
  const isLocked = status === "locked";
  const isFog = isLocked && reveal === "fog";

  // Waypoints rise into place on load, staggered by column so the trail unrolls
  // left→right. Pure CSS (tc-rise) with fill-mode `both`, so the resting state is
  // always visible — no dependence on JS to avoid a stranded opacity:0.
  const outerStyle: React.CSSProperties = {
    position: "absolute",
    left: node.cx - LABEL_W / 2,
    top: node.cy - NODE_R,
    width: LABEL_W,
    zIndex: isRecommended ? 20 : undefined,
    animationDelay: `${revealDelay}s`,
  };

  // Locked (fog + horizon): a dashed trail marker with a blurred name you can
  // peek at on hover/focus. Fog sits fainter and, out on the map, under the mist.
  if (isLocked) {
    return (
      <div className="tc-rise group" style={outerStyle}>
        <button
          type="button"
          onClick={onClick}
          aria-label={`${node.title}, locked`}
          style={{ width: NODE_D, height: NODE_D, borderColor: "var(--tc-trail-dim)" }}
          className={cn(
            "relative mx-auto flex items-center justify-center rounded-full border-2 border-dashed bg-[rgba(251,243,221,0.5)] transition-all duration-200 hover:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isFog ? "opacity-50 hover:opacity-90" : "opacity-80 hover:opacity-100",
          )}
        >
          <span className="text-sm leading-none opacity-40" style={{ color: "var(--tc-trail)" }}>🔒</span>
        </button>
        <p
          className="mt-2 text-center text-[11px] leading-tight line-clamp-2 blur-[3px] transition-all duration-200 group-hover:blur-0 group-focus-within:blur-0"
          style={{ color: isFog ? "rgba(84,63,34,0.5)" : "rgba(84,63,34,0.72)" }}
        >
          {node.title}
        </p>
      </div>
    );
  }

  // Mastery only enriches `completed` waypoints (Story 9.6), as a single-hue
  // progressive fill: more mastered reads as more solid/bright, so "what does
  // this color mean" doesn't need a legend — it's the same read as a battery
  // or a loading bar. A completed node with no MasteryInfo yet falls back to
  // the flat fully-solid look — never blank.
  const tier = isCompleted ? mastery?.tier : undefined;

  const style: React.CSSProperties = { width: NODE_D, height: NODE_D };
  if (isCompleted) {
    if (tier === "learning")
      // Barely filled — memory is fresh, nothing solid yet.
      Object.assign(style, {
        background: "var(--color-brand-tint)",
        borderColor: "var(--color-brand-tint-border)",
        color: "var(--color-brand-text)",
      });
    else if (tier === "reviewing")
      // Half filled — on its way to sticking.
      Object.assign(style, {
        background: "var(--color-brand-half)",
        borderColor: "var(--color-brand)",
        color: "var(--primary-foreground)",
        boxShadow: "0 2px 6px -2px rgba(120,92,52,0.35)",
      });
    else if (tier === "durable")
      // Fully solid + a glow — memory has fully taken hold. Selected layers the
      // elevation shadow on top — inline boxShadow wins over any class, so it's
      // merged here.
      Object.assign(style, {
        background: "var(--color-brand)",
        borderColor: "var(--color-brand)",
        color: "var(--primary-foreground)",
        boxShadow: isSelected
          ? "0 0 0 3px var(--color-brand-ring), 0 6px 14px -4px rgba(120,92,52,0.4)"
          : "0 0 0 3px var(--color-brand-ring)",
      });
    else
      Object.assign(style, {
        background: "var(--color-brand)",
        borderColor: "var(--color-brand)",
        color: "var(--primary-foreground)",
        boxShadow: "0 4px 10px -2px rgba(120,92,52,0.45)",
      });
  }
  // Hollow "unvisited but reachable" waypoint gets a trail-coloured ring.
  if (!isCompleted && !isRecommended) style.borderColor = "rgba(207,134,31,0.55)";
  if (isCompleted && mastery?.decaying) style.opacity = 1 - 0.5 * mastery.lateness;

  const label = isCompleted && mastery
    ? `${node.title}, ${mastery.tier}${mastery.decaying ? ", needs review" : ""}`
    : `${node.title}, ${status}`;

  return (
    <div className="tc-rise group" style={outerStyle}>
      {isRecommended && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground shadow-sm"
          style={{ background: "var(--tc-trail)" }}
        >
          You are here
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        style={style}
        className={cn(
          "relative mx-auto flex items-center justify-center rounded-full border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // Fill/border/color/shadow for completed nodes are fully inline (above) —
          // the mastery tier drives them, not a class.
          isCompleted && isSelected && "scale-110",
          // You are here — pulsing beacon marker.
          isRecommended && !isSelected &&
            "border-primary bg-primary/20 text-primary tc-beacon shadow-[0_3px_10px_-1px_rgba(207,134,31,0.5)]",
          isRecommended && isSelected && "scale-110 border-primary bg-primary/25 text-primary shadow-md",
          // Reachable, not the current pick — hollow ring waypoint (border inline).
          !isCompleted && !isRecommended &&
            "bg-[rgba(251,243,221,0.7)] text-primary hover:bg-[rgba(251,243,221,0.95)] hover:shadow-sm",
          !isCompleted && !isRecommended && isSelected && "scale-110 shadow-sm",
        )}
      >
        {isCompleted && <span className="text-base font-bold leading-none">✓</span>}
        {isCompleted && mastery?.decaying && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background"
            style={{ background: "var(--color-destructive)" }}
          />
        )}
        {!isCompleted && (
          <span
            className={cn("text-base leading-none", isRecommended ? "font-bold" : "font-medium opacity-80")}
            style={{ color: "var(--color-brand-text)" }}
          >
            →
          </span>
        )}
      </button>
      <p
        className={cn(
          "mt-2 text-center text-[11px] leading-tight line-clamp-2",
          isRecommended && "font-semibold",
          isSelected && "font-medium",
        )}
        style={{ color: isRecommended ? "var(--color-brand-text)" : "rgba(52,38,20,0.9)" }}
      >
        {node.title}
      </p>
    </div>
  );
}

// ── SkillTrackView (region) ───────────────────────────────────────────────────

function SkillTrackView({ track, unlock, reveal, mastery, recommendedId, selectedId, onSelect }: {
  track: SkillTrack; unlock: UnlockState; reveal: Record<string, RevealTier>; mastery: MasteryState;
  recommendedId: string | null; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const explored = track.nodes.filter((n) => unlock.byId[n.id] === "completed").length;
  // Where the mist begins: just past the rightmost *reachable* (clear/horizon)
  // waypoint, so the band only ever veils the fogged east — never an available or
  // completed node that happens to sit deep in a longer parallel branch.
  const hasFog = track.nodes.some((n) => reveal[n.id] === "fog");
  const reachableXs = track.nodes.filter((n) => reveal[n.id] !== "fog").map((n) => n.cx);
  const frontierMaxX = reachableXs.length ? Math.max(...reachableXs) : 0;
  const fogStartX = hasFog ? frontierMaxX + COL_W * 0.5 : null;

  return (
    <div className="mb-16">
      {/* Region cartouche */}
      <div className="mb-5 flex items-baseline gap-3 px-1">
        <span className="font-display text-xl italic leading-none" style={{ color: "var(--tc-ink)" }}>
          {track.label}
        </span>
        <span
          aria-hidden
          className="h-px flex-1"
          style={{ background: "linear-gradient(90deg, rgba(120,92,52,0.4), rgba(120,92,52,0.05))" }}
        />
        <span className="font-mono text-[10px] tracking-wide" style={{ color: "var(--tc-ink-mute)" }}>
          {explored}/{track.nodes.length} explored
        </span>
      </div>

      <div className="relative w-full" style={{ minWidth: track.width, height: track.height }}>
        {/* Breadcrumb trail (edges) */}
        <svg className="pointer-events-none absolute inset-0" width={track.width} height={track.height} aria-hidden>
          {track.edges.map((e) => {
            const [srcId, tgtId] = e.key.split("--");
            const active = (unlock.byId[srcId] ?? "locked") !== "locked";
            const intoFog = reveal[tgtId] === "fog";
            // Control points hug source/target before bending — shallow diagonals.
            const cp = (e.x2 - e.x1) * BEZIER_CP;
            return (
              <path
                key={e.key}
                d={`M ${e.x1} ${e.y1} C ${e.x1 + cp} ${e.y1} ${e.x2 - cp} ${e.y2} ${e.x2} ${e.y2}`}
                fill="none"
                strokeLinecap="round"
                // A dot-and-gap dash with round caps renders as a line of crumbs.
                strokeDasharray={active ? "0.1 12" : "0.1 11"}
                stroke={active ? "var(--tc-trail)" : "var(--tc-trail-dim)"}
                strokeWidth={active ? 3.5 : 2.5}
                strokeOpacity={active ? 0.9 : intoFog ? 0.28 : 0.5}
                className={active ? "tc-trail-live" : undefined}
              />
            );
          })}
        </svg>

        {/* Waypoints */}
        {track.nodes.map((node) => (
          <SkillNodeCircle
            key={node.id}
            node={node}
            status={unlock.byId[node.id] ?? "locked"}
            reveal={reveal[node.id] ?? "fog"}
            mastery={mastery.byId[node.id]}
            isRecommended={node.id === recommendedId}
            isSelected={node.id === selectedId}
            onClick={() => onSelect(node.id)}
            // Stagger the reveal by column so the trail unrolls left→right.
            revealDelay={Math.min((node.cx - TRACK_PAD) / COL_W * 0.05, 0.5)}
          />
        ))}

        {/* Mist over the unexplored east of the region. The region stretches to
            fill the sheet; the negative right pushes the mist across the sheet's
            px-10 (40px) right padding so it reaches the true edge with no visible
            stop where the content column ends. */}
        {fogStartX != null && (
          <div
            aria-hidden
            className="tc-mist pointer-events-none absolute top-0 bottom-0"
            style={{ left: Math.max(0, fogStartX - COL_W * 0.35), right: -40 }}
          />
        )}
      </div>
    </div>
  );
}

// ── Sidebar helpers ───────────────────────────────────────────────────────────

const statusWord = (s: NodeStatus) =>
  s === "completed" ? "completed" : s === "available" ? "available" : "locked";

const statusGlyph = (s: NodeStatus) =>
  s === "completed" ? "✓" : s === "locked" ? "🔒" : "";

function RelatedChip({ node, status, onFocus }: {
  node: GraphNode; status: NodeStatus; onFocus: (id: string) => void;
}) {
  const glyph = statusGlyph(status);
  const label = `${node.title}, ${statusWord(status)}`;
  const content = (
    <>{glyph && <span aria-hidden className="mr-0.5">{glyph}</span>}{node.title}</>
  );
  if (status === "locked") {
    return (
      <button
        type="button"
        onClick={() => onFocus(node.id)}
        aria-label={`${label} — show prerequisites`}
        className={cn(badgeVariants({ variant: "secondary" }), "opacity-60 cursor-pointer")}
      >
        {content}
      </button>
    );
  }
  return (
    <Badge variant="outline" asChild>
      <Link href={`/lesson/${node.id}`} aria-label={label}>{content}</Link>
    </Badge>
  );
}

function Section({ title, nodes, unlock, onFocus }: {
  title: string; nodes: GraphNode[]; unlock: UnlockState; onFocus: (id: string) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {nodes.map((n) => (
          <RelatedChip key={n.id} node={n} status={unlock.byId[n.id]} onFocus={onFocus} />
        ))}
      </div>
    </div>
  );
}

function NodeDetail({ node, graph, unlock, mastery, onFocus, onClose }: {
  node: GraphNode; graph: ConceptGraph; unlock: UnlockState; mastery?: MasteryInfo;
  onFocus: (id: string) => void; onClose: () => void;
}) {
  const status = unlock.byId[node.id];
  const nb = neighbors(graph, node.id);
  const unmet = nb.prerequisites.filter((p) => unlock.byId[p.id] !== "completed");
  // For an explored waypoint, surface its mastery tier (+ a fading suffix when
  // decaying) instead of the generic "completed" word (Story 9.6).
  const badgeText = status === "completed" && mastery
    ? `${mastery.tier}${mastery.decaying ? " · fading" : ""}`
    : statusWord(status);

  return (
    <Card className="shadow-md">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-0.5">Waypoint</p>
            <p className="font-display text-base font-semibold leading-snug">{node.title}</p>
            <Badge
              variant={status === "completed" ? "secondary" : status === "available" ? "outline" : "secondary"}
              className={cn("mt-1.5 font-mono text-[10px]", status === "locked" && "opacity-70")}
            >
              {badgeText}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close details"
            className="h-6 w-6 shrink-0 -mt-0.5 -mr-1 text-muted-foreground"
          >
            ✕
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {status === "locked" && unmet.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Reach it by clearing:</p>
              <div className="flex flex-wrap gap-1.5">
                {unmet.map((n) => (
                  <RelatedChip key={n.id} node={n} status={unlock.byId[n.id]} onFocus={onFocus} />
                ))}
              </div>
            </div>
          )}
          {status !== "locked" && (
            <Link
              href={`/lesson/${node.id}`}
              className="text-xs font-semibold hover:opacity-80 transition-opacity"
              style={{ color: "var(--color-brand-text)" }}
            >
              {status === "completed" ? "Review lesson →" : "Set out →"}
            </Link>
          )}
          {(nb.prerequisites.length > 0 || nb.next.length > 0) && <Separator />}
          <Section title="Trail from" nodes={nb.prerequisites} unlock={unlock} onFocus={onFocus} />
          <Section title="Trail to" nodes={nb.next} unlock={unlock} onFocus={onFocus} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── ConceptSkillTree (main) ───────────────────────────────────────────────────

export function ConceptSkillTree({ graph }: { graph: ConceptGraph }) {
  const [user, setUser] = useState<User | null>(null);
  const [reviews, setReviews] = useState<ReviewState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredUserId();
    if (stored) {
      getUser(stored).then(setUser).catch(() => {});
      // Best-effort: a failed fetch just means no mastery tiers render (nodes
      // fall back to flat explored), same graceful-degrade posture as getUser.
      getAllReviews(stored).then(setReviews).catch(() => {});
    }
  }, []);

  const unlock = useMemo(
    () => deriveUnlockState(graph, user?.completedConcepts ?? []),
    [graph, user],
  );

  // Derive per-concept mastery from the raw review rows. `now` is captured once
  // per `reviews` change — decay is day-scale, so a stale-by-render `now` is
  // fine; no ticking clock (owner Decision 3).
  const mastery = useMemo(() => deriveMastery(reviews), [reviews]);

  const recommendedId = useMemo(() => {
    if (user?.currentNode && unlock.available.includes(user.currentNode)) return user.currentNode;
    return unlock.available[0] ?? null;
  }, [user, unlock]);

  const reveal = useMemo(() => computeReveal(graph, unlock), [graph, unlock]);

  const tracks = useMemo(() => computeTracks(graph), [graph]);
  const recommended = recommendedId ? graph.byId[recommendedId] : null;
  const selectedNode = selectedId ? graph.byId[selectedId] : null;

  const total = graph.nodes.length;
  const explored = unlock.completed.length;
  const readyNow = unlock.available.length;
  const exploredPct = total > 0 ? Math.round((explored / total) * 100) : 0;

  return (
    <main className="tc-map relative flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">

      {/* ── Field notes (sidebar) ── */}
      <aside
        className="flex flex-col gap-4 px-5 py-6 md:w-72 md:shrink-0 md:overflow-y-auto"
        style={{ borderRight: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}
      >
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight" style={{ color: "var(--tc-ink)" }}>
            Trail of Concepts
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--tc-ink-soft)" }}>
            Follow the crumbs.
          </p>

          {/* Trail progress */}
          {total > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between text-[11px]" style={{ color: "var(--tc-ink-soft)" }}>
                <span>
                  <span className="font-semibold" style={{ color: "var(--tc-ink)" }}>{explored}</span> of {total} explored
                </span>
                {readyNow > 0 && (
                  <span className="font-medium" style={{ color: "var(--color-brand-text)" }}>{readyNow} ready</span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${exploredPct}%`, background: "var(--tc-trail)" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Resume CTA — only for users who've actually started (a stored user
            record). Anonymous visitors enter via a waypoint or the landing page.
            Lead with the recommended concept, or drop into extra practice once
            everything reachable is done, so "Continue" is never a dead end. */}
        {user && (recommended || unlock.completed.length > 0) && (
          <Link href="/session" className="block group">
            <Card className="relative overflow-hidden border-l-[3px] border-l-primary transition-shadow group-hover:shadow-md active:scale-[0.98]">
              <span
                aria-hidden
                className="pointer-events-none absolute -top-5 -left-4 w-36 h-36 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(255,180,84,0.1) 0%, transparent 65%)" }}
              />
              <CardContent className="pt-4 pb-4 relative">
                <Badge variant="secondary" className="font-mono text-[10px] tracking-widest uppercase mb-2">
                  {recommended ? "Resume trail" : "Keep practicing"}
                </Badge>
                <p className="font-display text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {recommended ? recommended.title : "Review what you've explored"}
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {selectedNode && (
          <NodeDetail
            key={selectedId}
            node={selectedNode}
            graph={graph}
            unlock={unlock}
            mastery={mastery.byId[selectedId!]}
            onFocus={(id) => setSelectedId(id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </aside>

      {/* ── Map sheet (canvas) ── */}
      <div className="tc-map-vignette relative flex-1 overflow-auto min-h-0">
        <div className="relative w-max min-w-full px-10 py-12">
          <ContourBackdrop />
          <div className="relative">
            {tracks.map((track) => (
              <SkillTrackView
                key={track.domain}
                track={track}
                unlock={unlock}
                reveal={reveal}
                mastery={mastery}
                recommendedId={recommendedId}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((prev) => prev === id ? null : id)}
              />
            ))}
          </div>
        </div>
      </div>

    </main>
  );
}
