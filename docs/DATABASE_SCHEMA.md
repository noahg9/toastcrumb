# Data Model

The database stores **dynamic user state only** — concepts, lessons, cards, and the graph
are static content under `/content` and are never modeled here. Concept and lesson ids
appear as plain strings, never foreign keys.

Field names below match the Prisma schema (`apps/api/prisma/schema.prisma`) and the shared
types in `@toastcrumb/types`.

## User

- `id`
- `email` / `passwordHash` / `googleId` / `name` — auth fields; all nullable so anonymous
  users (no signup required) are unaffected
- `role` — `"user"` (default) | `"superadmin"`. A validated string, not a Postgres enum.
  A **UX hint only** on the client; the server always re-checks it via a fresh DB lookup
  (`RolesGuard`). Promotion is a deliberate operator CLI action — there is no HTTP endpoint
  for role changes (that would be a privilege-escalation surface).
- `xp`, `level`, `streak`
- `lastActiveDate` — last UTC day a lesson was completed; drives the streak boundary
- `completedConcepts[]` — concept ids the user has finished
- `currentNode` — current position in the concept graph (a concept id), or null
- `reminderAnchorMinutes` / `reminderTimezone` — the **daily habit anchor**: the learner's
  self-chosen cue time ("after my morning coffee" → 08:00), stored as minutes after
  **local** midnight (0–1439) plus the IANA zone it was chosen in (e.g.
  `"Europe/Brussels"`, captured silently from the browser, never asked). Deliberately not
  a UTC instant, which would drift with DST and be unusable for a server-side send. Both
  null = no anchor set, which is the default and means nothing fires. Written only by
  `PUT /users/:id/reminder`; clearing the minutes clears the zone. Read today by the
  in-app "reviews due" surface on `/learn` (which fires at most one emphasised nudge per
  local day, and only when reviews are genuinely due); the stored zone exists so the daily
  email mirror can later compute the same local time server-side. A **preference, not
  progress** — an admin progress reset leaves it untouched.

## Progress

Per-user × per-concept completion.

- `userId`, `conceptId`
- `completion` — 0–100
- `lastAccessed`
- Unique on `(userId, conceptId)`, indexed on `userId`.

## ReviewState

Per-user × per-concept spaced-review memory model (FSRS-6). The scheduling unit is the
**concept** — the app rotates lesson variants over it. Fields map 1:1 to the
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) `Card` so persistence is a
trivial round-trip.

- `userId`, `conceptId`
- `stability` — FSRS memory stability (days); 0 until first graded review
- `difficulty` — FSRS difficulty (1–10); 0 until first graded review
- `due` — when the concept is next due for review
- `lastReview` — last graded-review instant; null until first grade
- `reps`, `lapses`
- `state` — FSRS state: 0=New, 1=Learning, 2=Review, 3=Relearning
- `elapsedDays`, `scheduledDays`, `learningSteps`
- `lastVariantId` — variant-rotation bookkeeping (not an FSRS field): the lesson-variant id
  most recently served as a review, so retrieval practice isn't a pattern-matchable repeat
- Unique on `(userId, conceptId)`; indexed on `userId` and `(userId, due)`.

## QuizOutcome

Per-**question** difficulty telemetry — one row per answered quiz question, pooled across
users to measure how hard each question is in practice (observed accuracy + response
latency). Aggregated **offline** to flag "illusion-of-competence" and out-of-band items for
content editing; it never drives live behavior.

- `userId`, `conceptId`, `lessonId`
- `questionId` — a hash of the question text (`questionId()` in `@toastcrumb/types`), so it
  needs no `id` field in content, survives card reordering, and a rewritten question maps to
  a new id (its old stats correctly no longer apply)
- `correct`
- `isPretest` — recorded but excluded from the difficulty band/flags (a pretest is designed
  to be answered wrong)
- `latencyMs` — time from question shown to answer picked; null when unavailable
- `surface` — `"lesson"` | `"review"` | `"daily"`
- `createdAt`
- Indexed on `questionId` and `userId`.

Written **fire-and-forget** — recording an outcome never mints XP, a streak, progress, or an
FSRS grade, and never blocks scoring or navigation.

## Event

A generic first-party **behavioral** event stream in our own Postgres (no third-party
analytics vendor). Where `QuizOutcome` captures per-question *difficulty*, `Event` captures
*behavior*: lesson/session starts and abandons, page views, sign-in attempts, daily plays.

- `userId`
- `name` — from a fixed catalog in `@toastcrumb/types` (`lesson_start`, `lesson_complete`,
  `lesson_abandon`, `session_start`, `session_complete`, `review_graded`, `daily_played`,
  `sign_in`, `register`, `page_view`). A validated string, not an enum — new names are
  additive and need no migration.
- `props` — flexible JSON payload, **PII-free by contract** (ids / indices / booleans only,
  never free-text answers, emails, or names), e.g. `{ conceptId, cardIndex }`
- `surface` — the emitting surface; optional
- `sessionId` — per-tab page-session id (for session / session-length analysis); null when
  unavailable
- `createdAt`
- Indexed on `name`, `userId`, and `createdAt`.

Written **best-effort, fire-and-forget**, same as `QuizOutcome` — it never affects scoring
or navigation.

> **Retention is deferred, not built.** The event table grows unbounded; a prune/rollup
> policy is a conscious future concern, named here rather than implemented now.

## EmailSubscriber

Email subscriber list for the daily-lesson mirror (the second product surface, Epic 12).
Standalone — **not** a `User` row: subscribing needs only an email, no account. Single
opt-in (no confirmation email); every send carries a mandatory one-click unsubscribe link.

- `id`
- `email` — unique, and stored normalized (`trim().toLowerCase()`). The unique index is
  case-sensitive, so without normalization two casings of one address would be two active
  subscriptions with two tokens, and unsubscribing via one would not stop the other.
- `unsubscribeToken` — opaque bearer token embedded in the unsubscribe link; a separate
  value from `id` so the link can be shared/leaked without exposing the subscriber's row id
- `subscribedAt`
- `unsubscribedAt` — null = active. Non-null = unsubscribed, but the row is **kept, not
  deleted**, so a re-subscribe of the same address is an idempotent reactivation
  (`unsubscribedAt` cleared, `unsubscribeToken` NOT rotated) with history intact
- `createdAt`, `updatedAt`
- Indexed on `unsubscribedAt`.

## DailyEmailLog

One row per UTC calendar day the daily-email cron has sent. A **global** marker (not
per-subscriber, per-user `Event`, or `QuizOutcome`). The row is **claimed before the first send**,
not written after the batch: `date` is the primary key, so the insert itself is the lock that
makes the day single-winner across replicas and across a restart mid-day. A run that loses the
race exits without sending anything.

- `date` — `YYYY-MM-DD` (UTC), the primary key
- `sentAt`
- `recipientCount` — the active-subscriber count at *claim* time, i.e. how many the run
  **intended** to reach. Not proof of delivery on its own.
- `completedAt` — null until the batch finishes cleanly. A null `completedAt` on an **old**
  claim is how a crashed or killed mid-batch run is detected and safely resumed; a null one on
  a *recent* claim means a batch is probably still running, so other runs stand off. A partial
  batch deliberately leaves this null so the day gets finished rather than being silently
  half-sent forever.
- `succeededCount` — how many sends actually succeeded. Compare against `recipientCount` to
  tell a full send from a partial one.
- `challengeId` — the `DailyChallenge.id` (`${conceptId}:${lessonId}:${cardIndex}`) named in
  that day's email, so a future debug/admin view can confirm what a given day's email sent

## DailyEmailSend

Per-recipient ledger for the daily email: one row per `(date, subscriber)` that was
**successfully** sent. This is what makes a resumed day safe — a re-run skips anyone already
recorded here, so taking over a crashed batch retries only the recipients who genuinely missed
out, and a transient Resend rate limit no longer drops someone permanently.

- `id`
- `date` — `YYYY-MM-DD` (UTC), matching `DailyEmailLog.date`
- `subscriberId`
- `sentAt`
- Unique on `(date, subscriberId)`; indexed on `date`.

> **Retention is deferred, not built.** One row per recipient per day grows without bound.
> Pruning by `date` is cheap and the index is there for it, but no policy exists yet — the same
> conscious gap recorded for `Event`.

