# syntax=docker/dockerfile:1

FROM node:24-trixie-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts

ARG VITE_API_URL
ARG VITE_MAPBOX_ACCESS_TOKEN
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_API_KEY
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_API_KEY

RUN npm run build --workspace @wave-atlas/web


FROM nginxinc/nginx-unprivileged:1.29.4-alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
