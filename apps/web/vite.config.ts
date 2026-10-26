import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { createBundleModuleInventoryPlugin } from './scripts/bundleBudget';
import { createFirstVisitBootstrapPlugin } from './scripts/firstVisitBootstrap';
import { decodeWebEnvironment } from './src/config/decodeWebEnvironment';

const environmentDirectory = fileURLToPath(new URL('.', import.meta.url));

// Configurable so a second instance (e.g. the visual-capture run, which needs a
// different database) can run alongside an ordinary dev server. Defaults unchanged.
const clientPort = Number(process.env.CLIENT_PORT ?? 3000);
const apiPort = Number(process.env.SERVER_PORT ?? 3001);

// So the self-signed cert covers the LAN IP too, not just localhost, letting
// other devices on the network open the https dev server without a hostname mismatch.
function getLocalNetworkIps(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((iface) => iface ?? [])
    .filter((net) => net.family === 'IPv4' && !net.internal)
    .map((net) => net.address);
}

export default defineConfig(({ mode }) => {
  const webConfig = decodeWebEnvironment(loadEnv(mode, environmentDirectory, 'VITE_'), mode);
  const argv = process.argv.slice(2).join(' ');
  const httpsRequested = argv.includes('--https') || process.env.DEV_HTTPS === 'true' || process.env.HTTPS === 'true';

  return {
    envDir: environmentDirectory,
    envPrefix: 'VITE_',
    define: {
      __SWELLDAYS_WEB_CONFIG__: JSON.stringify(webConfig),
    },
    plugins: [
      ...(httpsRequested ? [basicSsl({ domains: getLocalNetworkIps() })] : []),
      tanstackRouter({
        routesDirectory: './src/app/routes',
        generatedRouteTree: './src/app/routeTree.gen.ts',
        autoCodeSplitting: true,
      }),
      react(),
      tsconfigPaths(),
      createFirstVisitBootstrapPlugin(environmentDirectory),
      ...(mode === 'production'
        ? [createBundleModuleInventoryPlugin(environmentDirectory)]
        : []),
    ],
    server: {
      port: clientPort,
      host: httpsRequested ? true : undefined,
      allowedHosts: true as const,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      manifest: true,
    },
  };
});
