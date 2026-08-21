# syntax=docker/dockerfile:1

FROM node:24-trixie-slim AS manifests

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json


FROM manifests AS builder

RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY src/test/helpers/resetDb.ts ./src/test/helpers/resetDb.ts

RUN npm run prisma:generate --workspace @wave-atlas/api
RUN npm run build --workspace @wave-atlas/api


# One-shot image that owns the Prisma CLI, config, schema, and migrations.
FROM builder AS migrator

CMD ["npm", "run", "prisma:migrate:deploy", "--workspace", "@wave-atlas/api"]


# Prune the built tree against an orchestration-only root and the API workspace.
# Root dependency ownership is finalized later; clearing it only in this stage
# prevents browser packages from leaking into the API runner meanwhile.
FROM builder AS prod-deps

RUN npm pkg delete dependencies devDependencies
RUN npm pkg set "workspaces[0]=apps/api" "workspaces[1]=packages/contracts"
RUN npm pkg delete devDependencies --workspace @wave-atlas/api
RUN npm prune --omit=dev --omit=peer


FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=prod-deps /app/node_modules ./node_modules

EXPOSE 3001

CMD ["apps/api/dist/index.js"]
