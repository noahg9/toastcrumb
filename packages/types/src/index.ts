/**
 * Shared domain types for toastcrumb.
 *
 * Source of truth: docs/CONTENT_SYSTEM.md and docs/DATABASE_SCHEMA.md.
 *
 * Core principle (docs/ARCHITECTURE.md): "Content is static. User state is dynamic."
 *  - Content types (Concept, Lesson, Card) describe the static JSON in /content.
 *  - State types (User, Progress) describe rows owned by the API/database.
 */

// ---------------------------------------------------------------------------
// Content (static — lives in /content, never in the database)
// ---------------------------------------------------------------------------

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** A single card in a lesson. Order mirrors docs/CONTENT_SYSTEM.md lesson flow. */
export type CardType =
  | "context"       // real-world situation
  | "tension"       // the problem
  | "insight"       // concept reveal (dark card, blur-reveal UX)
  | "model"         // mental model: diagram / analogy
  | "quiz"          // micro quiz
  | "reward"        // payoff (dark card)
  | "misconception" // wrong belief, always followed by an insight card
  | "dialogue"      // back-and-forth conversation (newline-separated turns in body)
  | "stat"          // single key metric displayed large
  | "compare"       // side-by-side comparison (left vs right)
  | "flow"          // numbered steps showing a process
  | "diagram"       // architecture nodes + directed edges
  | "chart";        // horizontal bar chart

export interface BaseCard {
  type: CardType;
  /** Short body. Rule: no paragraph > 2-3 lines. */
  body: string;
  /** Optional punchy hook displayed large above the body text. */
  headline?: string;
}

export interface QuizCard extends Omit<BaseCard, "body"> {
  type: "quiz";
  /** Not rendered by the player; quiz content lives in `question`. */
  body?: string;
  question: string;
  options: string[];
  /** Index into `options`. */
  correctIndex: number;
  explanation?: string;
  /**
   * Marks this quiz as a *pretest* (Epic 10, Story 10.1): a prediction question
   * asked *before* the concept is taught, so the learner is expected to guess —
   * often wrong — and the following exposition lands harder. Absent/false = a
   * normal checking quiz (post-learning retrieval practice).
   *
   * A pretest is deliberately NOT answerable from the preceding cards and is
   * EXCLUDED from all correctness scoring — it never earns lesson XP, is never
   * graded into FSRS review stability, and is never drawn into the daily
   * challenge pool. It still renders and is answerable; its `explanation` is the
   * corrective feedback that reveals and teaches the answer.
   */
  pretest?: boolean;
  /**
   * Per-distractor explanations (Epic 10, Story 10.2), index-aligned to
   * `options`: `optionExplanations[i]` explains `options[i]`. For a WRONG option
   * it names, in one tight sentence, the specific misconception a learner who
   * picks it holds — so the correction lands on the exact wrong model they hold,
   * not a generic restatement. The CORRECT option's slot may be an empty string
   * (`""`) because the generic `explanation` already reinforces the right answer.
   *
   * When present, its length MUST equal `options.length` (a data-integrity
   * invariant enforced by both validators — a mismatch would render the wrong or
   * an out-of-bounds explanation). Absent = the existing single-`explanation`
   * behavior, unchanged. The existing content carries no `optionExplanations`
   * and is not edited; these arrive via regeneration (Story 10.6).
   */
  optionExplanations?: string[];
  /**
   * Marks this quiz as a *contrast question* (Epic 10, Story 10.3): an
   * interrogative item that pits **two** named cases/designs/embodiments side by
   * side and asks which behaves differently and *why*, driving analogical
   * transfer (comparing two cases forces the learner to abstract the underlying
   * principle — ~3x more transferable than studying cases separately).
   *
   * Unlike `pretest`, a contrast question is **post-teaching retrieval practice
   * and SCORES NORMALLY** — it counts toward lesson XP, is graded into FSRS
   * review stability, and is drawn into the daily pool exactly like any other
   * checking quiz. It is an ordinary checking quiz plus a semantic marker;
   * absent/false = an unmarked checking quiz. Its `question` MUST name both cases
   * inline so it stands alone when served standalone in review or the daily. The
   * existing content carries no `contrast` flag and is not edited; these arrive
   * via regeneration (Story 10.6).
   */
  contrast?: boolean;
}

export interface StatCard {
  type: "stat";
  headline?: string;
  /** Display value, e.g. "57M" or "99.9%" or "200ms". */
  value: string;
  /** Short label beneath the value, e.g. "requests/sec cached by Cloudflare". */
  unit: string;
  /** 1-2 sentences explaining the significance of the number. */
  context: string;
  body?: string;
}

export interface CompareCard {
  type: "compare";
  headline?: string;
  left: { label: string; points: string[] };
  right: { label: string; points: string[] };
  body?: string;
}

export interface FlowCard {
  type: "flow";
  headline?: string;
  steps: Array<{ label: string; detail?: string }>;
  body?: string;
}

/**
 * The visual layout a diagram should render as. When omitted, the renderer
 * auto-detects from the graph's topology (see diagram-layout.ts):
 * - "sequence": actors exchanging ordered/numbered messages over time
 * - "architecture": general system topology (components + connections)
 * - "tree": a rooted hierarchy (single root, each node one parent)
 * - "state": a state machine (states + labeled transitions, self-loops allowed)
 */
export type DiagramVariant = "sequence" | "architecture" | "tree" | "state";

export interface DiagramCard {
  type: "diagram";
  headline?: string;
  variant?: DiagramVariant;
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
  body?: string;
}

export interface ChartCard {
  type: "chart";
  headline?: string;
  chartType: "bar";
  title?: string;
  data: Array<{ label: string; value: number; unit?: string }>;
  body?: string;
}

/** Visual card types — rendered as designed components, not body text. */
export type VisualCardType = "stat" | "compare" | "flow" | "diagram" | "chart";

export type Card =
  | (BaseCard & { type: Exclude<CardType, "quiz" | VisualCardType> })
  | QuizCard
  | StatCard
  | CompareCard
  | FlowCard
  | DiagramCard
  | ChartCard;

export type LessonType = "scenario" | "quiz" | "mixed";

export interface Lesson {
  id: string;
  conceptId: string;
  type: LessonType;
  cards: Card[];
  xpReward: number;
  orderIndex: number;
}

export interface Concept {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  /** Domain / track this concept belongs to, e.g. "networking", "caching". */
  domain?: string;
  /** Concept ids that should be learned first. */
  prerequisites: string[];
  /** Graph edges — recommended next concepts. */
  next: string[];
  /** Real-world scenarios this concept is grounded in. */
  contexts: string[];
  lessons: Lesson[];
}

// ---------------------------------------------------------------------------
// User state (dynamic — owned by the API / database)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  /** Account email; null for anonymous or Google-only-without-email users. */
  email: string | null;
  /** Display name; null until set. */
  name: string | null;
  /**
   * Authorization role (Story 14.1, Epic 14): `"user"` (default) | `"superadmin"`.
   * A public, non-secret field. It is a UX hint only — the web app may read it to
   * gate the admin nav/route, but the API always re-checks the role server-side
   * (RolesGuard, fresh DB lookup) and never trusts a client-supplied role.
   */
  role: string;
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: Date | null;
  completedConcepts: string[];
  /** Current position in the concept graph. */
  currentNode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Returned by POST /api/auth/register and /api/auth/login. */
export interface AuthResponse {
  token: string;
  user: User;
}

export interface Progress {
  userId: string;
  conceptId: string;
  /** 0-100. */
  completion: number;
  lastAccessed: string; // ISO timestamp
}

/**
 * Per-user x per-concept spaced-review memory model (FSRS-6, Epic 9). The
 * scheduling unit is the concept — the app rotates lesson variants over it.
 * Fields mirror the ts-fsrs `Card`; see docs/DATABASE_SCHEMA.md.
 */
export interface ReviewState {
  userId: string;
  conceptId: string;
  /** FSRS memory stability (days); 0 until the first graded review. */
  stability: number;
  /** FSRS difficulty (1-10); 0 until the first graded review. */
  difficulty: number;
  /** When the concept is next due for review. */
  due: string; // ISO timestamp
  /** Last graded-review instant; null until the first grade. */
  lastReview: string | null; // ISO timestamp
  /** Successful-review counter. */
  reps: number;
  /** Times the card lapsed (Review -> Relearning). */
  lapses: number;
  /** FSRS state: 0=New, 1=Learning, 2=Review, 3=Relearning. */
  state: number;
  elapsedDays: number;
  scheduledDays: number;
  /** Current index within the FSRS (re)learning-steps schedule. */
  learningSteps: number;
  /**
   * Variant-rotation bookkeeping (Story 9.2), NOT an FSRS `Card` field. The
   * `/content` lesson id (e.g. "cache-aside-quiz") of the variant most recently
   * served as a review; null until the first review is served. FSRS schedules
   * the concept while the app rotates lesson variants underneath it.
   */
  lastVariantId: string | null;
}

// ---------------------------------------------------------------------------
// Game-loop constants (docs/GAME_LOOP.md)
// ---------------------------------------------------------------------------

export const XP_PER_LESSON = 10;
export const XP_PER_CORRECT_QUIZ = 5;
export const XP_PER_LEVEL = 100;

// Hard upper bound (safety net against runaway lessons), not the target. The
// generator aims for 8–12 and only goes higher when a concept genuinely has more
// to cover; validators reject only past this ceiling.
export const MAX_CARDS_PER_LESSON = 16;

/** First card in every lesson MUST be this type. */
export const FIRST_CARD_TYPE = "context" as const;

/** Every lesson MUST contain at least one card of each of these types. */
export const REQUIRED_CARD_TYPES = ["quiz"] as const;

/** Every concept MUST have at least this many lessons. */
export const MIN_LESSONS_PER_CONCEPT = 1;

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// ---------------------------------------------------------------------------
// Difficulty instrumentation (Epic 10, Story 10.5)
//
// Per-question telemetry: how hard each individual quiz question is in practice
// (observed accuracy + response latency), so the editorial gate can flag
// "illusion-of-competence" items for rewrite and — eventually — steer selection
// toward the empirically-optimal ~85% accuracy band. This is DYNAMIC user state
// (a DB row), never content; the capture path is fire-and-forget and NEVER
// affects XP / streak / FSRS / Progress.
// ---------------------------------------------------------------------------

/**
 * Tiny deterministic string hash (djb2, no dependency). Lifted from
 * `scripts/generate-content.ts` (Story 10.4) into the shared package so the web
 * client (at answer time) and the offline difficulty report (joining a stat back
 * to its content) derive the SAME id from the same text. Returns an unsigned
 * 32-bit integer.
 */
export function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

/**
 * Stable per-question identity for difficulty telemetry (Story 10.5). A short,
 * deterministic hash of the quiz card's `question` string — so it needs NO
 * content edit and no `id` field on cards. The same question text always maps to
 * the same id; a *rewritten* question maps to a NEW id (its old accuracy no
 * longer applies — which is exactly right, and means Story 10.6's regeneration
 * cleanly resets stats for changed items). It survives card reordering within a
 * lesson (positional identity would not). Base36 + a `q_` prefix so it reads as
 * an id, not a bare number.
 */
export function questionId(question: string): string {
  return `q_${stableHash(question).toString(36)}`;
}

/** The surface a quiz outcome was captured on (Story 10.5). */
export type QuizSurface = "lesson" | "review" | "daily";

/**
 * One answered quiz question's difficulty telemetry (Story 10.5). Dynamic user
 * state — persisted as a `QuizOutcome` DB row, pooled across users and keyed by
 * `questionId` (a hash of the question text) to measure how hard each individual
 * question is in practice. Captured fire-and-forget at each surface's completion
 * boundary; writing it NEVER mints XP / streak / Progress / an FSRS grade.
 *
 * Pretests (Story 10.1) ARE captured (flagged `isPretest: true`) but are excluded
 * from the difficulty band and the illusion-of-competence flag by the offline
 * report — a pretest is designed to be answered wrong, so its low accuracy is a
 * feature, not a difficulty signal.
 */
export interface QuizOutcome {
  /** Concept id from /content — a plain string, never a DB foreign key. */
  conceptId: string;
  /** /content lesson (variant) id the question was served from. */
  lessonId: string;
  /** Stable question identity — see `questionId()`. */
  questionId: string;
  correct: boolean;
  /** True for a pretest (recorded but excluded from the difficulty analysis). */
  isPretest: boolean;
  /**
   * Time from the question being shown to the answer being committed, in ms;
   * null when timing is unavailable. The "instant answer" signal for the
   * illusion-of-competence flag.
   */
  latencyMs: number | null;
  surface: QuizSurface;
}

// ---------------------------------------------------------------------------
// Behavioral event tracking (Epic 14, Story 14.2)
//
// A generic first-party event stream in our own Postgres — the raw material the
// superadmin console (14.3 metrics / 14.4 dashboards) aggregates, with NO
// third-party analytics vendor. An `Event` is DYNAMIC user state (a DB row),
// never content. Capture is best-effort, fire-and-forget, and NEVER affects
// XP / streak / FSRS / Progress / navigation (the Story 10.5 telemetry boundary).
//
// The event *name* is a validated string drawn from the EVENT_NAMES catalog
// below (NOT a Postgres enum) so new event types ship with just a new `name` +
// client call — no migration. New names are ADDITIVE: append to EVENT_NAMES.
// ---------------------------------------------------------------------------

/**
 * The first high-signal behavioral event catalog (Story 14.2, Decision 4). A
 * runtime `as const` array (+ the derived `EventName` union) so names can't
 * drift into typos client-side and the API can validate an incoming name
 * against the array. Follows the `REQUIRED_CARD_TYPES` array-const shape (not
 * `QuizSurface`, a bare union) — the API checks membership via
 * `(EVENT_NAMES as readonly string[]).includes(name)`.
 *
 * Keep names snake_case and props PII-free (ids / indices / booleans — never
 * free-text answers or emails). Expanding the catalog later needs no migration.
 */
export const EVENT_NAMES = [
  "lesson_start",
  "lesson_complete",
  "lesson_abandon",
  "session_start",
  "session_complete",
  "review_graded",
  "daily_played",
  "sign_in",
  "register",
  "page_view",
] as const;

/** A behavioral event name from the EVENT_NAMES catalog (Story 14.2). */
export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Max events per ingest batch (Story 14.2) — shared by the API's
 * `POST /users/:id/events` cap and the web `track()` client's chunk size, so
 * the client never slices a burst into chunks larger than the server accepts.
 */
export const MAX_EVENTS_BATCH = 100;

/**
 * The client → API payload for one behavioral event (Story 14.2). What the web
 * `track()` client buffers and the `POST /users/:id/events` batch ingest
 * accepts; `userId` is NOT part of the payload — it comes from the route param.
 * `props` is a flexible, PII-free key/value bag (Decision 1); `surface` and
 * `sessionId` are optional context (the per-tab page-session id lets 14.3
 * compute sessions / session length).
 */
export interface EventInput {
  name: EventName;
  props?: Record<string, unknown> | null;
  surface?: string | null;
  sessionId?: string | null;
}

/**
 * One persisted behavioral event row (Story 14.2) — an `EventInput` plus the
 * server-assigned identity/ownership/timestamp. What the 14.3 admin API reads
 * back. `createdAt` serializes to an ISO string over the wire (Date → JSON),
 * matching the other shared row interfaces (e.g. ReviewState).
 */
export interface Event extends EventInput {
  id: string;
  userId: string;
  createdAt: string;
}
