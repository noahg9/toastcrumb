# Build context is the monorepo root (needed for the @toastcrumb/types workspace
# dependency and the root pnpm lockfile). Deploy with `fly deploy` from the repo
# root using apps/api/fly.toml, which points --dockerfile here.

FROM node:22-slim AS builder
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/api ./apps/api

RUN pnpm --filter @toastcrumb/api prisma:generate
RUN pnpm --filter @toastcrumb/api build

FROM node:22-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/types ./packages/types
COPY --from=builder /repo/apps/api ./apps/api

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["sh", "start.sh"]
