# Split web/API release runbook

Swelldays remains one npm-workspace monorepo with one lockfile, but it produces three release artifacts:

- `apps/web/Dockerfile` builds static browser assets and serves them with unprivileged Nginx on port `8080`.
- `apps/api/Dockerfile --target runner` builds the Node API on port `3001`.
- `apps/api/Dockerfile --target migrator` builds the one-shot Prisma migration runner.

The root owns orchestration and CI. `apps/web`, `apps/api`, and `packages/contracts` own application code and direct dependencies.

## Configuration ownership

Never commit `apps/api/.env.production`, `apps/web/.env.production`, `deploy/.env.production`, or real credentials. Record each production value in the deployment platform's secret/configuration store.

Production runtime values are split by owner: `apps/api/.env.production` holds the API's own config and secrets (`DATABASE_URL`, `BETTER_AUTH_*`, Google/Cloudinary server credentials, payment config), `apps/web/.env.production` holds the `VITE_*` build-time values, and `deploy/.env.production` holds only `POSTGRES_PASSWORD` — the orchestration-level value Compose needs to interpolate `${POSTGRES_PASSWORD}` both in `docker-compose.prod.yml`'s `db` service and inside `apps/api/.env.production`'s `DATABASE_URL`.

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

## Build immutable images

Run builds from the repository root at the release commit. Use immutable tags such as the Git commit SHA.

Set `RELEASE_TAG` to that immutable identifier in the release environment before running these commands.

```sh
docker build \
  --file apps/web/Dockerfile \
  --target runner \
  --build-arg VITE_API_URL="$VITE_API_URL" \
  --build-arg VITE_MAPBOX_ACCESS_TOKEN="$VITE_MAPBOX_ACCESS_TOKEN" \
  --build-arg VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
  --build-arg VITE_GOOGLE_API_KEY="$VITE_GOOGLE_API_KEY" \
  --build-arg VITE_CLOUDINARY_CLOUD_NAME="$VITE_CLOUDINARY_CLOUD_NAME" \
  --build-arg VITE_CLOUDINARY_API_KEY="$VITE_CLOUDINARY_API_KEY" \
  --tag "swelldays-web:$RELEASE_TAG" \
  .

docker build \
  --file apps/api/Dockerfile \
  --target runner \
  --tag "swelldays-api:$RELEASE_TAG" \
  .

docker build \
  --file apps/api/Dockerfile \
  --target migrator \
  --tag "swelldays-migrator:$RELEASE_TAG" \
  .
```

The web image contains only Nginx configuration and compiled browser assets. The API runner excludes Prisma CLI and browser dependencies; the migrator deliberately includes Prisma CLI, schema, and `apps/api/prisma/migrations/0_init`.

## Production Compose invocation

`env_file:` passes values into containers, but it does not provide `${POSTGRES_PASSWORD}` interpolation while Compose parses the file. Always pass the production file to Compose itself:

```sh
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

Before touching a non-empty database, take and verify a backup. For the first empty deployment, the only migration applied must be `0_init`.

1. Start persistent PostgreSQL and wait for its health check.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml up --detach --wait db
   ```

2. Run the migrator once and require a zero exit status.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml run --rm migrate
   ```

3. Start the API from the same release commit, without rerunning dependencies.

   ```sh
   docker compose --env-file deploy/.env.production --file docker-compose.prod.yml up --detach --no-deps api
   curl --fail --show-error --silent https://api.example.com/api/health
   ```

4. Deploy the web image behind the public reverse proxy or load balancer.

   ```sh
   docker run --detach \
     --name swelldays-web \
     --restart unless-stopped \
     --publish 127.0.0.1:8080:8080 \
     "swelldays-web:$RELEASE_TAG"
   curl --fail --show-error --silent https://app.example.com/healthz
   ```

5. Configure DNS and TLS only after both health endpoints pass. Keep the web and API beneath the same parent domain when possible, for example `app.example.com` and `api.example.com`. This reduces credentialed-cookie and OAuth origin complexity; `FRONTEND_ORIGIN` must still exactly match the browser origin.

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

- Web-only rollback: redeploy the previous immutable web image. Its embedded API origin and provider identifiers return with that image.
- API rollback: redeploy the previous immutable API image only if it is compatible with the current schema.
- Migration rollback: Prisma migrations are forward-only here; there is no automatic down migration. Stop writes, preserve the failed database, and restore the verified pre-release backup into a replacement database when schema rollback is required.
- If the migrator fails, do not start the new API. Inspect migrator logs, correct configuration or migration compatibility, and rerun the same immutable migrator.
- Keep the previous web, API, and migrator tags until post-deployment checks and a backup cycle have completed.
