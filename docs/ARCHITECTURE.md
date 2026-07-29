# Architecture

toastcrumb is a content-driven micro-learning platform for software-engineering
intuition. This document describes how the app is built.

## Core principle

> **Content is static. User state is dynamic.**

Content (concepts, lessons, cards, graph edges) lives as version-controlled JSON under
`/content` and is **never** stored in the database. Only dynamic user state — XP, level,
streaks, per-concept progress, spaced-repetition scheduling — is persisted in PostgreSQL.
This split keeps content authoring in Git (reviewable, diffable, no migrations) and keeps
the database small and purely about the learner.

## System at a glance

- **Static, pre-generated content** loaded from JSON at build/render time
- **Stateful user progression** in Postgres via a small API
- **Graph-based navigation** — concepts unlock along prerequisite edges
- **A fast, swipe-based UI** built for short, habit-forming sessions

## Tech stack

| Technology | Version | Role |
| --- | --- | --- |
| Node.js | ≥ 20 (repo standard 24) | Runtime |
| pnpm | 11 | Monorepo package manager / workspaces |
| TypeScript | 5.7+ | Language across all packages |
| Next.js | 15 (App Router) | Web app |
| React | 19 | Web UI |
| Tailwind CSS | 4 | Styling (via `@tailwindcss/postcss`) |
| Framer Motion | 12 | Swipe / transition animations |
| NestJS | 11 | API framework |
| Prisma | 6 | ORM + migrations |
| PostgreSQL | — | Dynamic user-state store |

### Deployment

- **Web** → Vercel
- **API** → Railway (Docker; `apps/api/Dockerfile`)
- **Database** → Neon (managed PostgreSQL)
- **Content** → static JSON in the repo. The repo ships a small sample so the app runs
  from a clean clone; the hosted build overlays the full library (see
  [Content delivery](#content-delivery)).

## Source tree

```text
toastcrumb/
├── apps/
│   ├── api/                        # NestJS API — dynamic user state only
│   │   ├── prisma/schema.prisma    # User, Progress, ReviewState, QuizOutcome, Event
│   │   └── src/
│   │       ├── main.ts             # bootstrap, /api global prefix
│   │       ├── app.module.ts
│   │       ├── prisma/             # PrismaModule + PrismaService
│   │       ├── health/             # GET /api/health
│   │       ├── auth/               # JWT + Google OAuth, RolesGuard
│   │       ├── admin/              # superadmin console API (guarded)
│   │       ├── users/              # identity, XP, streaks, event ingest
│   │       ├── progress/           # per-concept progress
│   │       └── reviews/            # FSRS spaced-repetition state
│   └── web/                        # Next.js 15 App Router
│       ├── app/                    # routes: /, /learn, /lesson, /review, /daily, /session, /graph, /account, /auth, /admin
│       ├── components/
│       ├── lib/                    # content loader, API client, graph, FSRS, analytics
│       └── content/                # build-time copy of /content (gitignored)
├── packages/
│   └── types/                      # @toastcrumb/types: domain types + content rules + XP constants
├── content/
│   └── concepts/                   # static concept JSON (sample set in this repo)
├── scripts/
│   └── fetch-content.mjs           # build-time content overlay
└── docs/                           # architecture + reference specs (this doc lives here)
```

## System boundaries

**Frontend** renders the UI, handles swipe interactions and graph visualization, loads
static content, and holds transient UI state.

**Backend** owns anonymous/authenticated user identity, XP, streaks, per-concept progress,
spaced-repetition scheduling, and behavioral events.

**Database** stores dynamic state only: users, progress (completion + resume position), XP
and level, streaks, per-question difficulty telemetry (`QuizOutcome`), and behavioral
events (`Event`). It never stores concept definitions.

**Content** (static, under `/content`): concepts, lessons, cards/quizzes, and the graph
structure (prerequisite / next edges).

## Content delivery

The app reads content from `/content` at build and render time (the home page, sitemap,
and lesson pages all read it during `next build`, so pages are statically generated). The
content loader degrades to an empty set when no content is present, so the app never
crashes on a missing library.

This repo commits a **sample** concept set so a clean clone builds and runs with no
secrets. In the hosted deployment, `scripts/fetch-content.mjs` runs before `next build`
and overlays the full library from a private source when a token is configured; without a
token it is a no-op and the committed sample is used.

### SEO & social previews

Content pages carry full canonical/Open Graph/Twitter metadata, following one shared
pattern: `title`, `description`, `openGraph.{title,description,url,type:"website"}`,
`twitter.{card:"summary_large_image",title,description}`, and `alternates.canonical` (via
`getBaseUrl()`). This covers `/daily` (+ dated/archive variants), `/how-its-made`,
`/lesson/[conceptId]` (every concept's lesson page), and `/learn` (the concept-graph skill
tree). Each of those five surfaces has a dedicated `opengraph-image.tsx` route rendering a
branded 1200×630 PNG via the shared `renderDailyOg` builder — per-concept for lesson pages,
static for `/how-its-made` and `/learn`.

`/` is the exception: it exports no page-level `metadata` of its own and has no OG image
route, so it inherits only the site-level defaults from `app/layout.tsx` (`metadataBase`,
`title`, `description`, `keywords`, `openGraph.{title,type,siteName}`, `twitter.card:
"summary"`) — no page `openGraph.url` and no `alternates.canonical`.

`getBaseUrl()` reads `NEXT_PUBLIC_BASE_URL`, which is inlined at **build** time. It is
required on Vercel builds (the helper throws without it) because a missing value would
otherwise bake `localhost` into every canonical, `og:url` and OG image URL and silently
de-index the site; changing it in the dashboard has no effect until a redeploy.

`sitemap.ts` lists every concept's `/lesson/[conceptId]` URL, but only those with at least
one lesson (`lesson/page.tsx` 404s on a concept with zero lessons, so the sitemap filters
to match rather than advertise a dead link). `robots.ts` disallows the non-indexable,
per-user surfaces (`/auth/`, `/account/`, `/admin/`, `/review/`, `/session`) as a second,
belt-and-suspenders layer alongside those pages' own per-page `noindex` metadata.

## Authorization

The learner-facing surface is **open by design** — user and progress routes are
intentionally unauthenticated, matching a no-signup-required first experience.

The one guard-enforced surface is the internal operator console, which exposes all-user
data and destructive mutations:

- **Role model.** `User.role` is a validated string (`"user"` default | `"superadmin"`),
  not a Postgres enum. Promotion is a deliberate operator action via a CLI script; there
  is **no** HTTP endpoint for role changes (that would be a privilege-escalation surface).
- **`RolesGuard` reads the role fresh from the DB on every admin request** — it never
  trusts a JWT claim. JWTs are stateless with a 7-day expiry and no revocation, so a fresh
  lookup makes promotion/demotion take effect immediately.
- **The `role` in the JWT / sanitized user is a UX hint only** — it lets the web app gate
  the admin nav without a round-trip, and is never trusted server-side.
- **Fail-closed.** A route carrying `RolesGuard` with no `@Roles()` annotation is denied.

## Behavioral event tracking

A first-party behavioral event stream lives in the app's own Postgres — the raw material
the operator console aggregates. It honors the system's invariants:

- **First-party, our-DB-only.** No third-party analytics vendor. An `Event` is dynamic
  user state (a DB row), never content.
- **Generic by design.** One `Event` table = a `name` from a fixed catalog in
  `@toastcrumb/types` + a flexible `props` JSON payload. A new event type is a new name and
  a client `track()` call — **never a migration**.
- **Best-effort, fire-and-forget.** Captured web-side by a never-throwing `track()` client
  that buffers and flushes to a batch endpoint. Recording an event never mints XP, streaks,
  progress, or a spaced-repetition grade, and never blocks navigation or scoring.
- **PII-free by contract.** `props` carries ids, indices, and booleans only — never
  free-text answers, emails, or names.
- **Retention is deferred.** The table grows unbounded; a prune/rollup policy is a
  conscious future concern (see [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md)).

## Admin API (Epic 14)

The server side of the internal operator console lives in `apps/api/src/admin/`. It is the
**first and only** guard-enforced surface in the app; every other route stays open by
design (see [Authorization](#authorization)).

### Endpoints

All under the global `/api` prefix.

| Method   | Route                             | Purpose                                              |
| -------- | --------------------------------- | ---------------------------------------------------- |
| `GET`    | `/admin/metrics/overview`         | KPI aggregates: users, signups, DAU/WAU/MAU, streaks, quiz accuracy |
| `GET`    | `/admin/metrics/retention`        | Weekly signup cohorts × subsequent-week activity      |
| `GET`    | `/admin/users`                    | Paginated, case-insensitive search over email/name/id |
| `GET`    | `/admin/users/:id`                | One user: progress, review summary, recent activity   |
| `PATCH`  | `/admin/users/:id`                | Edit `name` / `email`                                 |
| `POST`   | `/admin/users/:id/reset-progress` | Wipe learning state, keep the account                 |
| `DELETE` | `/admin/users/:id`                | Delete the user (cascades their rows)                 |
| `GET`    | `/admin/content/difficulty`       | Per-question difficulty telemetry as JSON             |

Deliberately **absent**: impersonate / login-as, and any role mutation.

### Guards are declared at the controller class level

`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("superadmin")` sit on `AdminController`
itself, never on individual methods. Every handler here returns all-user PII or performs a
destructive mutation, so **one unguarded handler is a full-database leak**. Class-level
placement makes protection the default: a handler added later inherits it, and there is no
per-method annotation to forget. The uniform matrix is *no token → 401 · `role:"user"` →
403 · `role:"superadmin"` → 200*.

### Role changes are script-only

`PATCH /admin/users/:id` **rejects a `role` key with a 400** rather than ignoring it.
Promotion and demotion happen only through `pnpm role:set`, so **no HTTP request can change
anyone's role** — not even from an authenticated superadmin session.

That is a statement about *roles*, not about account access. `email` is a login identifier,
so editing it is security-relevant: because nothing in the app verifies an email address,
pointing a user's address at one you control was once enough to take over their account via
Google sign-in. Account linking now refuses to attach a Google identity to a row that
already holds credentials of its own, which closes that path; a verified-email flag is the
proper long-term fix. Treat email edits as sensitive, and note the audit row records only
*which fields* changed, not their values.

### Lockout guards

Three refusals protect the console from being made unusable, since `role` is not editable
over HTTP and recovery otherwise needs shell access:

- **Deleting the account you are signed in as** → 400.
- **Deleting the last remaining superadmin** → 400, re-counted inside a transaction so two
  admins deleting each other concurrently cannot both succeed.
- **Resetting your own progress** → 400 (a mis-click that would wipe the operator's own
  learning state).

### Metrics are aggregated on read, and label their own source

Metrics are computed with Prisma aggregation / `groupBy` plus a little raw SQL. There is
**no rollup table** — a conscious deferral, to add only when read latency demands it.

Activity metrics carry a `source` field:

- **`"events"`** — the window starts at or after the point where `Event` data is complete,
  so it is answered from that stream (unioned with `QuizOutcome`, because event ingest is
  fire-and-forget and can silently drop a genuinely active learner).
- **`"approx"`** — the window reaches back before it, and is approximated from
  `User.lastActiveDate`, `Progress.lastAccessed` and `QuizOutcome.createdAt`. Those first
  two record only the *most recent* visit, so historical windows under-count.

The boundary is **not** the migration timestamp. That value is only a floor — it records
when the migration was authored, not when events began in a given database, so a deploy that
applied it later would have had event-less windows labelled exact. The effective boundary is
`max(floor, MIN(Event.createdAt))`, read from the database and reported as
`eventTrackingStart`, and `EVENT_TRACKING_START_OVERRIDE` in the environment wins over both.

**Operator activity is excluded from product metrics.** `admin_action` audit rows are real
`Event` rows owned by the acting admin, so every activity aggregation filters out
server-only event names — otherwise using the console would make the operator count as an
active learner, and two actions on two days would make them a returning one.

The approximation is **never presented as exact**: each metric ships a `note` explaining
the caveat, and the retention response carries an explicit `simplifications` list (weeks are
Monday-start UTC; the in-flight week is flagged `partial`). Period 0 is the signup week, and
what that means depends on the source — near-100% under `"events"`, but *not* under
`"approx"`, where the fallback signals only retain each user's latest visit and a low period
0 is a measurement artefact rather than a signup problem. The response states whichever
applies rather than asserting the `"events"` reading unconditionally.

### The difficulty aggregation has one implementation

`apps/api/src/admin/difficulty.ts` owns the thresholds, the pretest exclusion and the flag
maths. Both `GET /admin/content/difficulty` **and** the offline
`pnpm report:difficulty` script call it, so the console and the editorial report cannot
give different answers. The script is now only a formatter.

### Two caveats worth knowing

- **The content join reads `/content` server-side.** This is the one admin path that
  touches static content from the server. It is a read for *reporting* — turning an opaque
  `questionId` hash back into readable question text — not runtime content serving, so the
  static-content invariant holds. When the directory is absent the join degrades to empty
  and the numbers stay correct; only the labels are lost. The response reports both
  `contentEntriesIndexed` (how many questions content offered) and `joinResolved` (how many
  actually matched) — the two differ precisely when the join is systemically broken, e.g. if
  `questionId`'s hashing ever changes, which would otherwise show a healthy index alongside
  silently unlabelled results.
- **`difficulty.ts` imports `questionId` from `@toastcrumb/types` at runtime**, against the
  `import type`-only convention below. Deliberate: the join must use the *exact* hash the
  client stamps, and a duplicated copy that drifted would break it silently. Note this
  makes the API's runtime dependency on the shared package real — it already was, via the
  event-name catalog in `users/`, and it resolves only on a Node that can load the
  package's TypeScript entrypoint. Worth resolving properly by building the package.

### Every mutation is audited

Reset, delete and edit each write a server log line first (unloseable) and then an
`admin_action` `Event` row. The row is owned by **the admin, not the target**, so it
survives the very deletion it records. `props` carries the action, the target id and
counts only — no emails or names, honoring the PII-free `Event` contract. `admin_action` is
a **server-only** event name: the unauthenticated ingest endpoint rejects it, because a
forgeable audit trail is worthless.

Two known limits, recorded rather than implied away:

- **Audit rows do not outlive the admin who wrote them.** `Event.userId` cascades on delete,
  so deleting a former admin erases their audit history. Fixing it properly needs a separate
  audit table (or a nullable owner); until then the server log line is the durable trace.
- **Reads are not audited.** Only the three mutations are. `GET /admin/users` returns every
  user's email and name, so a leaked superadmin token could page the whole table leaving no
  record beyond HTTP access logs.

### Superadmin console (web)

`apps/web/app/admin/` is the client for the API above: an overview dashboard (KPI tiles +
signup/streak charts), a retention cohort grid, a user-management table with search and
pagination, a user-detail page with edit/reset/delete mutations, and a content-difficulty
view. `apps/web/lib/admin-api.ts` holds typed wrappers for all eight endpoints; unlike the
learner-facing wrappers in `lib/api.ts`, they distinguish 401/403/404/409/400 so a failed
mutation surfaces the API's own message rather than disappearing silently. Wire types live in
`@toastcrumb/types` under an `Admin*` prefix — 14.3 deliberately shipped without them, so this
is their first and only declaration.

**The route gate is client-side and UX only.** The web app has no `middleware.ts` and no
server-side session anywhere — auth is a `localStorage` JWT read in the browser. `app/admin/`
hides itself (and its nav entry) from anyone whose fetched user row isn't `role:
"superadmin"`; the real boundary is the API's `RolesGuard` above, which re-checks on every
request regardless of what the client renders. The gate deliberately reads the role from
`GET /users/:id` — a fresh DB read — and never from the JWT's `role` claim, which is minted at
sign-in and goes stale the moment an operator is promoted or demoted.

Three choices carry over from the API's own discipline once they reach the UI:

- **Honest metric labeling.** Every `source: "events" | "approx"` value renders as a labeled
  badge with its `note`; retention's `simplifications` and null/partial cohort cells (blank,
  never `0%`) render as the API returns them, not simplified away.
- **Destructive-action confirmation.** Reset and delete both require an explicit confirm step
  naming the user and consequence, and are disabled outright on the signed-in admin's own row
  — mirroring the API's self-reset/self-delete/last-superadmin refusals so an operator never
  has to hit the 400 to learn the rule exists.
- **No console self-pollution.** `PageViewTracker` (the app-wide `page_view` emitter mounted
  in the root layout) is suppressed for any `/admin/*` path, for the same reason the API
  excludes `admin_action` rows from its own aggregations: without it, browsing the console
  would count as learner activity and inflate the very DAU/retention numbers it displays.

Charts are dependency-free inline SVG rather than a charting library — the app has no dark
mode and only a handful of chart shapes (two trend bars, a streak histogram, a retention
heat-table), so a small hand-built set was cheaper than a new runtime dependency for an
operator-only page.

## Daily email mirror (Epic 12)

A second product surface: the full daily challenge (question, options, revealed answer),
mailed once a day to anyone who subscribes with just an email — no account needed.

- **Daily-selection math lives in `@toastcrumb/types`, not just `apps/web`.** The pure
  UTC-calendar-day → pool-index functions (`buildDailyPool`, `dailyChallengeIndex`,
  `dailyChallengeNumber`, `challengeDateKey`, `publicChallenge`, the `DailyChallenge` /
  `PublicDailyChallenge` types) moved from `apps/web/lib/daily.ts` into the shared types
  package so the API can compute the exact same day's challenge as the web app without
  importing across `apps/web` ↔ `apps/api`. `apps/web/lib/daily.ts` re-exports them
  unchanged and keeps only its impure, content-reading wrappers.
- **The API reads `/content` directly, a second independent reader.** `apps/api/src/mailer/daily-content.ts`
  mirrors the admin difficulty report's `CONTENT_DIR` resolution (its own copy, not a
  shared import — the two content readers are deliberately kept independent) and computes
  today's **full** `DailyChallenge` (including `correctIndex`/`explanation`, unlike the
  web's answer-stripped `PublicDailyChallenge`).
  **The concept ORDER is part of that reader's contract, not an implementation detail:**
  `buildDailyPool` appends in concept iteration order and `dailyChallengeIndex` indexes into
  the result, so the API must reproduce `apps/web/lib/content.ts`'s final
  `.sort((a, b) => a.difficulty - b.difficulty)` exactly — `readdir` order alone is
  filesystem-dependent and diverged on every single pool position. The **error contract** is part of
  the same requirement: `dailyChallengeIndex` is a modulo over pool *length*, so the two readers must
  also agree on membership. Both are therefore all-or-nothing — one malformed concept file yields no
  challenge rather than a silently shortened pool. Ties in `difficulty` still resolve by `readdir`
  order in both readers (every concept currently sits in a tie group), so a shared deterministic
  ordering is open follow-up work.
- **Subscription is a standalone `EmailSubscriber` row, not a `User`.** Subscribing needs
  only an email; there is no account, password, or JWT tie-in. `POST /api/subscribers`,
  `GET /api/subscribers/unsubscribe?token=...` and `POST /api/subscribers/unsubscribe?token=...`
  are all unauthenticated by design — a new, narrow resource with its own minimal validation,
  not an extension of the `/users/:id` V1 posture. `POST /api/subscribers` — and **only** that
  handler — is rate-limited (`@nestjs/throttler`, bound with `@UseGuards` at method level, not on
  the class and not as an `APP_GUARD`) because it is an unauthenticated write that creates a
  permanent mail recipient. The unsubscribe routes are deliberately **never** throttled:
  rate-limiting a mandatory opt-out would turn a burst of unsubscribes, or one-click POSTs from a
  mail provider's shared IP range, into silent failures. Note `ThrottlerModule` is itself
  `@Global`, so where `forRoot()` is registered does not scope the config — the method-level guard
  binding is what limits the blast radius. Addresses are normalized (`trim().toLowerCase()`)
  before storage, since Postgres unique indexes are case-sensitive and two casings of one
  address would otherwise be two subscriptions with two unsubscribe tokens.
- **Unsubscribe: the `GET` is non-mutating; the `POST` performs the opt-out.** Mail clients
  and security gateways routinely prefetch links found in delivered mail, so a mutating GET
  would silently unsubscribe people who never clicked. `GET` redirects to the web app's
  `/unsubscribe?token=…` confirmation page, whose button issues the `POST`. A missing, array-valued
  or over-long token lands on that page's "link isn't valid" branch — **not** on `/unsubscribed`,
  which asserts the opt-out succeeded and must only be reachable after the `POST`. The daily email
  also carries RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  headers so a mail client's own native unsubscribe control works in one click — it POSTs,
  which is why the header pair and the non-mutating GET must stay together. Unknown, stale,
  missing and array-valued tokens all resolve without a 404 or 500.
- **Links baked into outbound email come from `API_PUBLIC_URL`, not `WEB_APP_URL`.** The
  unsubscribe route is a NestJS controller on the API origin (Railway), which is a different
  origin from the web app (Vercel) in every environment; the web app has no `/api` rewrite and
  no `app/api` directory, so a link built from `WEB_APP_URL` 404s. `apps/api/src/common/public-urls.ts`
  holds both base-URL helpers in one place and strips trailing slashes (a trailing slash
  otherwise produced `//daily`, which Next.js does not treat as the same route).
- **Mailer: Resend**, behind a `MailerService` with one real implementation. If
  `RESEND_API_KEY` is unset — **or set without `MAIL_FROM_ADDRESS`** — the service logs a
  warning at boot and every send becomes a no-op that logs and resolves; local dev/CI/preview
  environments need zero mailer credentials. This is a lower-severity missing-config path than
  the JWT/Google fail-fast checks in `main.ts` (the app is fully usable with the mailer
  disabled). A key present without a from-address is treated as *disabled* rather than
  enabled-and-broken, because Resend rejects every send with an empty `from` and those
  rejections would otherwise look like a completed batch.
  **The Resend SDK does not throw on API errors** — network failures, 4xx, 422 on an unverified
  domain, 429 rate limits and 5xx all come back as `{ data: null, error }`. `MailerService`
  therefore inspects `error` and rejects, so the cron's per-recipient catch is real and a
  failed batch is visible instead of reporting N/N successes.
- **Send scheduling: one fixed UTC time for everyone (08:00 UTC), via `@nestjs/schedule`'s
  in-process `@Cron`** — not a queue, not per-subscriber local time, not a Vercel Cron
  hitting the web app. The API already deploys to a long-running container (Railway), so
  an in-process cron keeps DB access (subscribers) and content access (the concept JSON)
  in the same process. Per-subscriber local-time sending (honoring `User.reminderAnchorMinutes`
  / `reminderTimezone`) is deferred future work, not built.
- **Idempotency via `DailyEmailLog`**, one row per UTC calendar day, **claimed before the
  first send** rather than written after the batch. The `date` primary key makes the day
  single-winner, so two API replicas (or a rolling-deploy overlap at 08:00 UTC) cannot both
  mail the list: the loser's insert hits the unique violation and that run exits without
  sending. Writing the row afterwards instead left a read-then-write window spanning the whole
  batch. The accepted trade is that a crash mid-batch means the remaining recipients miss that
  day rather than receiving a duplicate — a duplicate send to the whole list is more visible to
  subscribers and more damaging to sender reputation than one missed day. **Known limitation:**
  that missed day is currently silent and permanent. The surviving claim row looks identical to a
  full success. That is now solved: `completedAt` stays null until the batch finishes cleanly, and a
  **`DailyEmailSend` per-recipient ledger** records each success as it happens. A run that finds an
  incomplete claim younger than 30 minutes assumes another process is still sending and stands off;
  older than that it resumes, and the ledger means only the recipients who actually missed out are
  retried — zero double-sends. A partial batch deliberately leaves `completedAt` null so the day
  gets finished rather than staying half-sent. The same ledger is why a transient Resend rate limit
  no longer drops a recipient for good; sends are additionally paced at ~1.6/sec, under Resend's
  ~2/sec default. Opt-out state is re-read immediately before each send, so someone unsubscribing
  mid-batch is not mailed minutes later from a stale snapshot. An instance that cannot actually
  deliver mail (no
  `RESEND_API_KEY`/`MAIL_FROM_ADDRESS`) refuses to claim at all, so a staging deploy or a developer
  machine sharing the database cannot suppress the real send. It is a global marker, distinct from
  the per-user `Event` stream and from `QuizOutcome`.
- **Per-recipient failures never abort the batch** — one bad address is caught and logged;
  the cron continues to the next subscriber (mirrors the fire-and-forget discipline of the
  behavioral-event and quiz-outcome writers).

## Data flow

1. The frontend loads static concept JSON from `/content`.
2. The user works through a lesson (swipe through cards, answer quizzes).
3. The frontend records progress and events via the API.
4. The database updates the user's dynamic state (XP, streak, progress, scheduling).
5. The frontend reflects the updated graph and XP.

## Conventions

- **Workspace types are `import type`-only in the API.** The shared package's runtime XP
  constants are duplicated locally in the API to avoid shipping uncompiled TypeScript into
  the CommonJS NestJS build. Do not import the package's runtime values into the API.
- **The web app transpiles the shared package** via `transpilePackages: ["@toastcrumb/types"]`.
- **A shared `tsconfig.base.json`** at the repo root is extended by each package.
- **Quality gates:** `pnpm typecheck` and `pnpm lint` (ESLint 9 flat config) run in CI.
- **Testing:** no automated test runner is wired up yet — a deliberate near-term gap.
- **Architectural invariant:** content is static under `/content`; only dynamic user
  state lives in Postgres. Never add content to the database.

## Key design constraints

- No live AI generation in production — content is generated offline and committed as
  reviewed JSON.
- No video and no long-form content — the format is short, swipe-sized cards.
- No heavy per-request backend computation.

## Why this shape

- Fast iteration — content ships as Git commits, not migrations.
- Clear separation of concerns — static content vs. dynamic state.
- Scales without early complexity — a monolith API and a single database go a long way.
- Fits the graph-based learning model directly.
