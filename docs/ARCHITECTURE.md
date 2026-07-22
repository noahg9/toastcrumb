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
│   │       ├── users/              # identity, XP, streaks, event ingest
│   │       ├── progress/           # per-concept progress
│   │       └── reviews/            # FSRS spaced-repetition state
│   └── web/                        # Next.js 15 App Router
│       ├── app/                    # routes: /, /learn, /lesson, /review, /daily, /session, /graph, /account, /auth
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
