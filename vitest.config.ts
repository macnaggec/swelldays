import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const alias = {
  app: resolve(__dirname, './apps/web/src/app'),
  views: resolve(__dirname, './apps/web/src/views'),
  widgets: resolve(__dirname, './apps/web/src/widgets'),
  features: resolve(__dirname, './apps/web/src/features'),
  entities: resolve(__dirname, './apps/web/src/entities'),
  shared: resolve(__dirname, './apps/web/src/shared'),
  server: resolve(__dirname, './apps/api/src'),
}

const clientAlias = {
  ...alias,
  test: resolve(__dirname, './apps/web/src/test'),
}

const serverAlias = {
  ...alias,
  test: resolve(__dirname, './src/test'),
}

export default defineConfig({
  test: {
    projects: [
      // -----------------------------------------------------------------------
      // Client — React components, hooks, UI logic.
      // jsdom simulates the browser environment.
      // -----------------------------------------------------------------------
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.{ts,tsx}', 'apps/web/src/**/*.test.{ts,tsx}'],
          exclude: ['apps/api/src/**'],
          setupFiles: ['./vitest.setup.client.ts'],
        },
        resolve: { alias: clientAlias },
      },
      // -----------------------------------------------------------------------
      // Server — services, repositories, adapters, route handlers.
      // node environment has correct crypto/stream/fs support and no DOM globals.
      // -----------------------------------------------------------------------
      {
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['apps/api/src/**/*.test.ts', 'packages/contracts/src/**/*.test.ts'],
          exclude: ['apps/api/src/**/*.integration.test.ts'],
          setupFiles: ['./vitest.setup.server.ts'],
        },
        resolve: { alias: serverAlias },
      },
      // -----------------------------------------------------------------------
      // Integration — server code tested against a real Postgres DB.
      // Requires the test DB to be running: npm run test:db:up
      // Does NOT mock prisma — uses the real PrismaClient via .env.test.
      // -----------------------------------------------------------------------
      {
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          include: ['apps/api/src/**/*.integration.test.ts'],
          setupFiles: ['./vitest.setup.integration.ts'],
          globalSetup: ['./vitest.globalSetup.integration.ts'],
          fileParallelism: false,
        },
        resolve: { alias: serverAlias },
      },
    ],
  },
})
