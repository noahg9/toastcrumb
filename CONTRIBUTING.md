# Contributing

Thanks for your interest in toastcrumb. This repository is the open application — the
web UI, the API, shared types, and a small sample of learning content. The full concept
library and the content-generation pipeline that produce it are maintained separately, so
contributions here focus on the **app**, not the content.

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env       # set DATABASE_URL (any Postgres)
pnpm db:generate
pnpm db:migrate
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev
```

## Before you open a PR

- `pnpm typecheck` and `pnpm lint` must pass (CI runs both).
- Keep changes focused; one concern per PR.
- Match the surrounding code style — the codebase is intentionally consistent.

## Adding sample content

Drop a `Concept` JSON file in `content/concepts/<id>.json` matching the type in
`packages/types`. Keep `prerequisites`/`next` links pointing only at concepts that exist in
this repo so the graph stays closed.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened.
