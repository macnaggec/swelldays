# syntax=docker/dockerfile:1

FROM node:24-trixie-slim AS manifests

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json


FROM manifests AS builder

RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

RUN npm run prisma:generate --workspace @swelldays/api
RUN npm run build --workspace @swelldays/api


# One-shot image that owns the Prisma CLI, config, schema, and migrations.
FROM builder AS migrator

CMD ["npm", "run", "prisma:migrate:deploy", "--workspace", "@swelldays/api"]


# Prune the built tree against the orchestration-only root and API workspace.
FROM builder AS prod-deps

RUN npm pkg delete dependencies devDependencies
RUN npm pkg set "workspaces[0]=apps/api" "workspaces[1]=packages/contracts"
RUN npm pkg delete devDependencies --workspace @swelldays/api
RUN npm prune --omit=dev --omit=peer


FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=prod-deps /app/node_modules ./node_modules

EXPOSE 3001

CMD ["apps/api/dist/index.js"]
