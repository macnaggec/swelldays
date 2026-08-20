# Separate frontend and backend deployment

The monorepo produces two independent artifacts:

- `Dockerfile` builds the API server and migration runner.
- `Dockerfile.frontend` builds the Vite browser app and serves it as static files on port `8080`.

## Frontend image

All `VITE_*` values are public build-time configuration. Vite embeds them into the browser bundle, so changing one requires rebuilding the frontend image.

```sh
docker build \
  --file Dockerfile.frontend \
  --build-arg VITE_API_URL=https://api.swelldays.surf \
  --build-arg VITE_MAPBOX_ACCESS_TOKEN=... \
  --build-arg VITE_GOOGLE_CLIENT_ID=... \
  --build-arg VITE_GOOGLE_API_KEY=... \
  --build-arg VITE_CLOUDINARY_CLOUD_NAME=... \
  --build-arg VITE_CLOUDINARY_API_KEY=... \
  --tag swelldays-frontend .
```

`VITE_API_URL` is required and must be the public, absolute origin of the separately deployed API. The other values enable the corresponding map, Google Picker, and Cloudinary browser features.

Run the built image locally:

```sh
docker run --rm --publish 8080:8080 swelldays-frontend
```

The container exposes `/healthz` for deployment health checks. Its web-server fallback returns `index.html` for application routes, so direct requests and refreshes on nested routes keep working.

## Backend image

Build only the API runtime target:

```sh
docker build --target runner --tag swelldays-backend .
```

The backend deployment must set these public-origin values consistently:

- `APP_URL` and `CLIENT_URL`: the public frontend origin, for checkout redirects and credentialed CORS/auth requests.
- `BETTER_AUTH_URL`: the public backend origin.
- `SERVER_PORT`: the container port, currently `3001`.

For production, configure the frontend and API beneath the same parent site when possible, such as `swelldays.surf` and `api.swelldays.surf`. The browser app sends credentials to the API explicitly, while the API admits only the configured frontend origin.
