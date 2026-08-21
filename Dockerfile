# syntax=docker/dockerfile:1

FROM node:24-trixie-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY . .

RUN npm run prisma:generate --workspace @wave-atlas/api
RUN npm run build:server


# Одноразовый контейнер только для миграций
FROM builder AS migrator

CMD ["npm", "run", "prisma:migrate:deploy", "--workspace", "@wave-atlas/api"]


# Production dependencies
FROM builder AS prod-deps

RUN npm prune --omit=dev


# Production API
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /app/dist/server ./dist/server
COPY --from=prod-deps /app/node_modules ./node_modules

EXPOSE 3001

CMD ["dist/server/index.js"]
