// @ts-check
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';

const serverClientIntegrationRestriction = {
  group: ['shared/lib/trpc', 'shared/lib/trpcClient', 'shared/lib/queryClient'],
  message: 'Server code must use server/trpc and server-safe shared contracts, not browser tRPC/query clients.',
};

const contractsDeepImportRestriction = {
  group: ['@wave-atlas/contracts/*'],
  message: 'Import contracts through the explicit @wave-atlas/contracts public surface.',
};

export default defineConfig(
  ...tseslint.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      'src/app/routeTree.gen.ts',
    ],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'packages/contracts/src/**/*.ts'],
    plugins: { boundaries, 'react-hooks': reactHooks },
    languageOptions: {
      parser: tseslint.parser,
    },
    settings: {
      'boundaries/elements': [
        // Server tests stay inside the server dependency boundary while still being
        // allowed to use shared contracts and test helpers.
        { type: 'server-test', pattern: ['src/server/**/*.test.ts', 'src/server/**/*.integration.test.ts'], mode: 'full' },
        // Test files are file-path matches, not folder elements. Keep this before
        // app layers so non-server tests are classified as test before their containing layer.
        { type: 'test',    pattern: ['src/test/**', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'], mode: 'full' },
        { type: 'app',     pattern: 'src/app/**' },
        { type: 'views',   pattern: 'src/views/**' },
        // Each widget folder is its own element; cross-widget imports are forbidden
        // unless the caller is a higher layer using the widget's public index.
        {
          type: 'widgets',
          pattern: 'src/widgets/*/**',
          capture: ['widgetName'],
        },
        // Each sub-folder of features/ is its own element; featureName is captured for
        // the same-feature allow rule below (C2 guard).
        {
          type: 'feature',
          pattern: 'src/features/*/**',
          capture: ['featureName'],
        },
        // Each entity slice is its own element; entityName is captured for the
        // same-entity allow rule (internal imports stay legal; external must use the index).
        {
          type: 'entity',
          pattern: 'src/entities/*/**',
          capture: ['entityName'],
        },
        { type: 'shared',  pattern: 'src/shared/**' },
        { type: 'server',  pattern: 'src/server/**' },
        { type: 'contracts', pattern: 'packages/contracts/src/**', mode: 'full' },
        { type: 'types',   pattern: 'src/types/**' },
      ],
      // eslint-import-resolver-typescript resolves the '*' → './src/*' tsconfig alias so
      // boundaries can match resolved paths against element patterns.
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json', './packages/contracts/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        rules: [
          // app may import any layer (including server: tRPC requires the router type for e2e typesafety)
          // Entity imports are index-only: app code may not reach into entity internals.
          {
            from: { type: 'app' },
            allow: {
              to: [
                { type: 'views' },
                { type: 'widgets', path: 'src/widgets/*/index.ts' },
                { type: 'feature', path: 'src/features/*/index.ts' },
                { type: 'entity', path: 'src/entities/*/index.ts' },
                { type: 'shared' }, { type: 'server' }, { type: 'types' }, { type: 'contracts' },
              ],
            },
          },
          // views may import widgets and below
          {
            from: { type: 'views' },
            allow: {
              to: [
                { type: 'widgets', path: 'src/widgets/*/index.ts' },
                { type: 'feature', path: 'src/features/*/index.ts' },
                { type: 'entity', path: 'src/entities/*/index.ts' },
                { type: 'shared' }, { type: 'types' }, { type: 'contracts' },
              ],
            },
          },
          // widgets may import features and below
          {
            from: { type: 'widgets' },
            allow: {
              to: [
                { type: 'feature', path: 'src/features/*/index.ts' },
                { type: 'entity', path: 'src/entities/*/index.ts' },
                { type: 'shared' }, { type: 'types' }, { type: 'contracts' },
                { type: 'widgets', captured: { widgetName: '{{widgetName}}' } },
              ],
            },
          },
          // C2 guard: a feature may only import shared, its OWN feature folder, and entity
          // indexes (the published contract surface — never entity internals directly).
          {
            from: { type: 'feature' },
            allow: {
              to: [
                { type: 'entity', path: 'src/entities/*/index.ts' },
                { type: 'shared' },
                { type: 'types' },
                { type: 'contracts' },
                { type: 'feature', captured: { featureName: '{{featureName}}' } },
              ],
            },
          },
          // entity: a slice may import its own internals freely; cross-entity imports must
          // go through the target entity's public index only (same contract rule as features).
          {
            from: { type: 'entity' },
            allow: {
              to: [
                { type: 'entity', captured: { entityName: '{{entityName}}' } },
                { type: 'entity', path: 'src/entities/*/index.ts' },
                { type: 'shared' },
                { type: 'types' },
                { type: 'contracts' },
              ],
            },
          },
          // shared/lib/trpc.ts and trpcClient.ts need a type-only import of AppRouter from server/router
          // for tRPC end-to-end type safety. This is erased at compile time — no runtime coupling.
          { from: { type: 'shared', path: 'src/shared/lib/trpc*.ts' }, allow: { to: [{ type: 'server', path: 'src/server/router.ts' }] } },
          // Browser-owned shared modules may use the platform-neutral contracts package.
          { from: { type: 'shared' }, allow: { to: [{ type: 'shared' }, { type: 'types' }, { type: 'contracts' }] } },
          // server: routes/services/repositories use server-internal modules and shared/server-safe contracts.
          { from: { type: 'server' },  allow: { to: [{ type: 'server' }, { type: 'shared' }, { type: 'types' }, { type: 'contracts' }] } },
          // server tests may use server code, shared contracts, global types, and test helpers,
          // but not client-facing app/entity/feature/widget/view layers.
          { from: { type: 'server-test' }, allow: { to: [{ type: 'server' }, { type: 'shared' }, { type: 'types' }, { type: 'test' }, { type: 'contracts' }] } },
          // test helpers may import anything
          { from: { type: 'test' },    allow: { to: { type: ['app', 'views', 'widgets', 'feature', 'entity', 'shared', 'server', 'types', 'test', 'contracts'] } } },
          // Contracts are the platform-neutral leaf of the workspace graph.
          { from: { type: 'contracts' }, allow: { to: [{ type: 'contracts' }] } },
        ],
      }],
      'no-restricted-imports': ['error', {
        patterns: [contractsDeepImportRestriction],
      }],
    },
  },
  {
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [contractsDeepImportRestriction, serverClientIntegrationRestriction],
      }],
    },
  },
  {
    files: ['src/widgets/GlobeMap/**/*.ts', 'src/widgets/GlobeMap/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'entities/Spot',
            importNames: ['useSelectedSpot'],
            message: 'GlobeMap must receive selected spot state from GlobeScene props, not read route-derived selection directly.',
          },
          {
            name: '@tanstack/react-router',
            message: 'GlobeMap must stay route-agnostic. Derive route state in GlobeScene and pass explicit props down.',
          },
        ],
        patterns: [
          contractsDeepImportRestriction,
          {
            group: ['features/*', 'features/**'],
            message: 'GlobeMap is a map adapter. Feature state/actions belong in GlobeScene or feature-owned containers.',
          },
          {
            group: ['views/*', 'views/**', 'app/*', 'app/**'],
            message: 'GlobeMap must not depend on higher app/view layers. Pass explicit props or callbacks from GlobeScene.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/server/repositories/**/*.ts'],
    ignores: ['src/server/repositories/**/*.test.ts', 'src/server/repositories/**/*.integration.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          contractsDeepImportRestriction,
          serverClientIntegrationRestriction,
          {
            group: ['server/services/*', 'server/providers/*', 'server/providers/**/*'],
            message: 'Repositories must stay persistence-only. Put workflow and provider orchestration in services.',
          },
        ],
      }],
    },
  },
  // shared/lib/trpc*.ts may only type-import from server modules.
  // A runtime import would pull the server router and all its dependencies into the browser bundle.
  {
    files: ['src/shared/lib/trpc.ts', 'src/shared/lib/trpcClient.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['server/*', 'server/**/*'],
          allowTypeImports: true,
          message: 'Shared tRPC files may only type-import from server modules. Use `import type` to prevent runtime coupling.',
        }, contractsDeepImportRestriction],
      }],
    },
  },
  {
    files: ['src/features/**/*.ts', 'src/features/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          contractsDeepImportRestriction,
          {
            group: ['server/providers/*', 'cloudinary', '@cloudinary/*'],
            message: 'Feature code must not import provider SDKs directly. Use a port or command hook.',
          },
          {
            group: ['shared/lib/trpcClient'],
            message: 'Feature code must use useUploadCommands (or equivalent hooks) rather than the raw tRPC client.',
          },
        ],
      }],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '@wave-atlas/api', '@wave-atlas/api/*',
              '@wave-atlas/web', '@wave-atlas/web/*',
              'app/*', 'views/*', 'widgets/*', 'features/*', 'entities/*', 'shared/*', 'server/*',
            ],
            message: 'Contracts cannot depend on either application.',
          },
          {
            group: [
              'react', 'react/*', 'react-dom', 'react-dom/*',
              'vite', 'vite/*', '@vitejs/*',
              'hono', 'hono/*', '@hono/*', '@trpc/*',
              '@prisma/*', 'prisma', 'better-auth', 'better-auth/*',
              '@mantine/*', '@tanstack/*', 'mapbox-gl', 'cloudinary', 'pg',
              'node:*', 'fs', 'fs/*', 'path', 'path/*', 'crypto', 'http', 'https',
              'stream', 'buffer', 'url', 'os', 'net', 'tls',
            ],
            message: 'Contracts must remain platform-neutral.',
          },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'process', message: 'Contracts cannot read Node process state.' },
        { name: 'window', message: 'Contracts cannot read browser globals.' },
        { name: 'document', message: 'Contracts cannot read browser globals.' },
        { name: 'navigator', message: 'Contracts cannot read browser globals.' },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/shared/model/appRouteIntent.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'TSUnionType:has(TSLiteralType Literal[value=/^(browse|browsing|galleryWorkspace|routeWorkspace|workspace|mapInput|fullPage|immersiveMapInput)$/])',
        message: 'Route intent unions must be imported from shared/model/appRouteIntent.',
      }],
    },
  },
);
