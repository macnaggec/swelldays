# Split web/API release runbook

Swelldays remains one npm-workspace monorepo with one lockfile, but it produces three release artifacts:

- `apps/web/Dockerfile` builds static browser assets and serves them with unprivileged Nginx on port `8080`.
- `apps/api/Dockerfile --target runner` builds the Node API on port `3001`.
- `apps/api/Dockerfile --target migrator` builds the one-shot Prisma migration runner.

The root owns orchestration and CI. `apps/web`, `apps/api`, and `packages/contracts` own application code and direct dependencies.

Neither `web` nor `api` publishes a host port. Both join an external Docker network named `web`, and a reverse proxy already attached to that network (Caddy, in production) terminates TLS and forwards to them by container name. That reverse proxy and its certificates are owned outside this repo — this compose file only assumes the `web` network already exists (`docker network create web` if it doesn't).

## Configuration ownership

Never commit `apps/api/.env.production`, `apps/web/.env.production`, `deploy/.env.production`, or real credentials. Record each production value in the deployment platform's secret/configuration store.

Production runtime values are split by owner: `apps/api/.env.production` holds the API's own config and secrets (`DATABASE_URL`, `BETTER_AUTH_*`, Google/Cloudinary server credentials, payment config) and lives on the VPS, and `deploy/.env.production` holds only `POSTGRES_PASSWORD` — the orchestration-level value Compose needs to interpolate `${POSTGRES_PASSWORD}` both in `docker-compose.prod.yml`'s `db` service and inside `apps/api/.env.production`'s `DATABASE_URL`. The `VITE_*` build-time values live as GitHub Actions secrets, since the web image is now built in CI (see "Automated release pipeline" below); `apps/web/.env.production` is only a fallback for a manual, break-glass build.

### Web build-time public values

These values are embedded in downloadable JavaScript. They are not secrets, must be restricted by provider/domain where supported, and changing any of them requires rebuilding and redeploying the web image.

| Value | Purpose |
| --- | --- |
| `VITE_API_URL` | Absolute public API origin, with no path. |
| `VITE_MAPBOX_ACCESS_TOKEN` | Browser Mapbox token; restrict it to the deployed web domains. |
| `VITE_GOOGLE_CLIENT_ID` | Browser OAuth client ID. |
| `VITE_GOOGLE_API_KEY` | Google Picker browser key; restrict it to the deployed web domains and Picker API. |
| `VITE_CLOUDINARY_CLOUD_NAME` | Public Cloudinary account identifier. |
| `VITE_CLOUDINARY_API_KEY` | Public Cloudinary API key. |
| `VITE_SENTRY_DSN` | Optional. Enables browser error reporting; blank disables it entirely. Not a secret — Sentry DSNs are meant to ship in client code. |

The web decoder rejects missing production values, invalid API origins, and server-secret names placed behind `VITE_*`.

### API runtime configuration

Changing these values requires restarting the API, not rebuilding either image.

| Value | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production configuration requirements and logging. |
| `FRONTEND_ORIGIN` | One absolute web origin used by credentialed CORS, Better Auth trusted origins, and checkout redirects. |
| `BETTER_AUTH_URL` | Absolute public API origin used by Better Auth. |
| `SERVER_PORT=3001` | API listen port inside the container. |
| `GOOGLE_CLIENT_ID` | Server-side Google OAuth client ID. Optional — omitting both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` disables the "Sign in with Google" provider; email/password sign-in still works. |
| `CLOUDINARY_CLOUD_NAME` | Server-side copy of the public Cloudinary account identifier. |
| `CLOUDINARY_API_KEY` | Server-side copy of the public Cloudinary API key. |
| `PAYMENT_PROVIDER` | Explicitly `mock` or `cryptocloud`; production must never infer a real provider. |
| `SENTRY_DSN` | Optional. Enables server-side error reporting; blank disables it entirely (the API still logs to stdout). |

### API and database secrets

Changing these values requires restarting the API and, where noted, the database or migrator. Never expose them through `VITE_*`.

| Value | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL used by the API and migrator. With Compose, use host `db` and port `5432`. |
| `POSTGRES_PASSWORD` | Compose interpolation and initial PostgreSQL password. It must agree with `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | Random Better Auth signing/encryption secret of at least 32 characters; placeholders are rejected. |
| `GOOGLE_CLIENT_SECRET` | Server-side Google OAuth secret. Optional — see `GOOGLE_CLIENT_ID` above. |
| `CLOUDINARY_API_SECRET` | Server-only Cloudinary signing secret. |
| `CRYPTOCLOUD_API_KEY` | Required only when `PAYMENT_PROVIDER=cryptocloud`. |
| `CRYPTOCLOUD_SHOP_ID` | Required only when `PAYMENT_PROVIDER=cryptocloud`. |
| `CRYPTOCLOUD_SECRET_KEY` | Required only when `PAYMENT_PROVIDER=cryptocloud`; verifies webhooks. |

Google server credentials are optional but must be provided as a pair — set both to enable "Sign in with Google," or leave both unset to defer it. Selecting CryptoCloud requires all three CryptoCloud values. Invalid production configuration exits before the API listens.

Note: `apps/web/.env.production`'s `VITE_GOOGLE_CLIENT_ID`/`VITE_GOOGLE_API_KEY` are a separate, always-required pair — they power the "import from Google Drive" upload feature (Google Picker), independent of server-side sign-in. Deferring `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` above does not defer those.

## Automated release pipeline

Pushing a tag matching `v*` (e.g. `v1.2.0`) triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml):

1. **Build and push** — builds all three images at that commit and pushes them to GHCR as `ghcr.io/macnaggec/swelldays-{web,api,migrator}:<tag>`. The web build reads its `VITE_*` build args from GitHub Actions secrets, not from `apps/web/.env.production`.
2. **Deploy** — copies `docker-compose.prod.yml` to the VPS over SCP, then SSHes in and runs the pull-and-restart sequence below with `RELEASE_TAG` set to that tag.

The VPS never receives application source code, a Dockerfile, or a git clone of this repo — only the one orchestration file, since every container it runs comes pre-built from GHCR.

After starting the new containers, the deploy step also runs `docker image prune -af`, removing every image no longer referenced by a running container. This keeps the VPS from accumulating one extra image per release; GHCR, not the VPS, is the durable copy of old versions — rollback re-pulls from there regardless (see Rollback below).

Only tag a commit that has already merged to `main` and passed CI (`.github/workflows/ci.yml` runs on every push, tags included, but the release workflow does not itself gate on that run).

One-time setup this pipeline depends on (see the deploy guide for exact steps): GitHub Actions secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH`, and the six `VITE_*` build values; a deploy-only SSH key authorized on the VPS; a plain directory on the VPS at `DEPLOY_PATH` containing `apps/api/.env.production` and `deploy/.env.production` (created once, by hand); and `docker login ghcr.io` run once on the VPS so it can pull the (private) images.

## Production Compose invocation

`docker-compose.prod.yml` pulls pre-built images — it does not build them. Every command needs both `RELEASE_TAG` (which image tag to pull/run) and `POSTGRES_PASSWORD` available for interpolation. The automated pipeline exports `RELEASE_TAG` itself; set it by hand for any manual command:

```sh
export RELEASE_TAG=v1.2.0
docker compose \
  --env-file deploy/.env.production \
  --file docker-compose.prod.yml \
  config --quiet
```

Use the same prefix for every production Compose command:

```sh
docker compose --env-file deploy/.env.production --file docker-compose.prod.yml <command>
```

## First deployment order

Before touching a non-empty database, take and verify a backup. For the first empty deployment, the only migration applied must be `0_init`. The automated pipeline runs steps 1–4 itself; this is also the manual sequence for a break-glass deploy.

1. Start persistent PostgreSQL and wait for its health check.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml up --detach --wait db
   ```

2. Pull the release images and run the migrator once, requiring a zero exit status.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml pull
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml run --rm migrate
   ```

3. Start the API from the same release tag, without rerunning dependencies.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml up --detach --no-deps api
   ```

4. Start the web app the same way.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml up --detach --no-deps web
   ```

5. Point the reverse proxy at both by container name (`web`, `api`) on the `web` network, then verify through it — this is the real end-to-end check, since neither container is reachable any other way:

   ```sh
   curl --fail --show-error --silent https://app.example.com/healthz
   curl --fail --show-error --silent https://api.example.com/api/health
   ```

   DNS and the reverse proxy's TLS certificate must already be in place before this step succeeds; keep the web and API beneath the same parent domain when possible, for example `app.example.com` and `api.example.com` — this reduces credentialed-cookie and OAuth origin complexity. `FRONTEND_ORIGIN` must still exactly match the browser origin.

## Health and smoke checks

- Web liveness: `GET /healthz` returns `200` and `ok`.
- API liveness: `GET /api/health` returns `200` and `{"ok":true}`.
- A direct request to a nested browser route must return the SPA entry rather than `404`.
- The deployed browser bundle must contain the expected public API origin and no server-secret names.

After infrastructure checks, complete this user-level checklist:

1. Register with email/password, sign in, sign out, and sign back in.
2. Complete Google sign-in and confirm the callback returns to the application.
3. Load and interact with the map.
4. Upload media directly to Cloudinary.
5. Import media from Google Drive.
6. Save a surf session, refresh, and reopen it.
7. Restart the API and confirm the saved session persists.
8. Add media to the cart and complete checkout.
9. For CryptoCloud, confirm the signed webhook fulfills the order exactly once.
10. Open and download purchased media.

Provider login, payment, and real browser flows require a human with production accounts; record their result separately from automated health checks.

## Logs to inspect

```sh
docker compose --env-file deploy/.env.production --file docker-compose.prod.yml logs --since=15m api migrate db
docker logs --since=15m swelldays-web
```

Confirm that:

- the migrator reports `0_init` applied or no pending migrations;
- the API reports its listen port only after configuration validation;
- startup reconciliation completes;
- there are no repeated Prisma connection, CORS, Better Auth, Cloudinary, or payment-webhook errors;
- Nginx serves `/healthz`, the entry document, and hashed assets without a restart loop.

Do not log environment values while diagnosing configuration.

## Backup and restore expectations

The PostgreSQL volume is persistent but is not a backup. Before every migration or database-affecting release, create an encrypted, access-controlled dump and verify that it can be listed and restored into a separate database.

```sh
BACKUP_FILE="swelldays-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file deploy/.env.production --file docker-compose.prod.yml \
  exec --no-TTY db pg_dump --username surfuser --dbname surfdb --format custom \
  > "$BACKUP_FILE"

pg_restore --list "$BACKUP_FILE"
```

Test restores on a replacement or staging database first. During an approved recovery window, restore the selected dump with credentials supplied by the deployment platform:

```sh
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --dbname "$RESTORE_DATABASE_URL" \
  "$BACKUP_FILE"
```

Never overwrite the live database merely to test a restore.

## Rollback

Every previous release's images remain in GHCR under their tag, so rollback is re-running the deploy with an older `RELEASE_TAG` — no rebuild needed:

- Web-only rollback: `export RELEASE_TAG=<previous tag>` on the VPS, then `pull` and `up --detach --no-deps web`. Its embedded API origin and provider identifiers return with that image. If `docker-compose.prod.yml` itself changed structure between the two releases, restore the version SCP'd for the previous release before running this.
- API rollback: same, but only if the previous API image is compatible with the current schema.
- Migration rollback: Prisma migrations are forward-only here; there is no automatic down migration. Stop writes, preserve the failed database, and restore the verified pre-release backup into a replacement database when schema rollback is required.
- If the migrator fails, do not start the new API. Inspect migrator logs, correct configuration or migration compatibility, and rerun the same immutable migrator.
- Keep previous web, API, and migrator tags in GHCR until post-deployment checks and a backup cycle have completed.

## Commercial SEO delivery gate (October 25, 2026)

See [the SEO operations runbook](seo/operations-and-measurement.md) and [verification report](seo/verification-2026-10-25.md). Main-domain `/sitemap.xml` and public documents must reach the API shim for ordinary users and crawlers. `/index.html`, `/robots.txt`, assets and private SPA documents remain web-owned. Never route index.html into the shim it feeds. Do not guess an external Caddyfile: obtain running config/imports/invocation/upstreams, prepare a minimal exact diff, back up after authorization, validate in its actual context, then obtain approval for reload. Application release and Caddy application are separate actions. Backend query changes still require fresh verified database backup/isolated restoration before production deployment, even without new migrations. Submit the main sitemap only after live verification and account authorization.
