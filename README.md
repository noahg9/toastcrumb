# toastcrumb (open engine)

The open-source engine behind **toastcrumb** — a habit-forming micro-learning app that
makes software engineering concepts click through short, addictive, real-world scenarios.

This repository is the runnable application: the swipe-based learning UI, the user-state
API, the shared types, and a small sample of learning content so the app works end to end.
The full concept library and the AI content-generation pipeline that produce it power the
hosted product and are not part of this repo.

> Core architectural principle: **content is static, user state is dynamic.**
> The database never stores learning content — only a user's progress, streaks, and XP.

## Monorepo layout

| Path | What | Stack |
| --- | --- | --- |
| `apps/web` | Swipe-based learning UI | Next.js 15 · Tailwind v4 · Framer Motion |
| `apps/api` | User state, XP, streaks, progress, events | NestJS 11 · Prisma 6 · PostgreSQL |
| `packages/types` | Shared domain types + content rules | TypeScript |
| `content/` | Static concept/lesson JSON (**sample set** — see note below) | JSON |

## Open-core: how content works

This is the open application. The **full concept library and the pipeline that generates it
are proprietary** and live in a private repository — they're the product, not the code.

- `content/concepts/` ships with a small, self-contained **sample** (the caching cluster) so
  the app is fully functional from a clean clone with no secrets. Each file is one `Concept`
  matching the type in `packages/types`; drop in more `content/concepts/<id>.json` files and
  they appear automatically.
- In the **hosted deployment**, the web build overlays the full library:
  `scripts/fetch-content.mjs` runs before `next build` and, when a `CONTENT_REPO_TOKEN` is
  set, pulls `content/` from the private repo. Without the token it's a no-op and the sample
  is used. See that file's header for the env vars (`CONTENT_REPO_TOKEN`, `CONTENT_REPO`,
  `CONTENT_REPO_REF`).

## Prerequisites

- Node ≥ 20 (see `.nvmrc`)
- pnpm 11
- A PostgreSQL database for the API (any Postgres — local Docker, Neon, etc.)

## Setup

```bash
pnpm install

# API: configure DB and generate the Prisma client
cp apps/api/.env.example apps/api/.env       # set DATABASE_URL
pnpm db:generate
pnpm db:migrate                              # creates tables

# Web: point at the API
cp apps/web/.env.local.example apps/web/.env.local
```

## Develop

```bash
pnpm dev        # runs web (:3000) and api (:4000) together
pnpm dev:web    # web only
pnpm dev:api    # api only
```

- Web: http://localhost:3000
- API health: http://localhost:4000/api/health

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system shape, boundaries, content delivery
- [Data model](docs/DATABASE_SCHEMA.md) — the dynamic-state tables
- [Content system](docs/CONTENT_SYSTEM.md) — concept/lesson/card shapes and authoring rules
- [Concept graph](docs/CONCEPT_GRAPH.md) — how concepts link and unlock
- [Game loop](docs/GAME_LOOP.md) — XP, streaks, review, daily challenge
- [UI guidelines](docs/UI_GUIDELINES.md) — design direction

## License

Code is licensed under the [Apache License 2.0](LICENSE). The sample learning content under
`content/` is licensed separately under [CC BY-NC 4.0](content/LICENSE) — see that file.
