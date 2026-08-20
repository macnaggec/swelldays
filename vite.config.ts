import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

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

export default defineConfig(() => {
  const argv = process.argv.slice(2).join(' ');
  const httpsRequested = argv.includes('--https') || process.env.DEV_HTTPS === 'true' || process.env.HTTPS === 'true';

  return {
    envPrefix: 'VITE_',
    plugins: [
      ...(httpsRequested ? [basicSsl({ domains: getLocalNetworkIps() })] : []),
      tanstackRouter({
        routesDirectory: './src/app/routes',
        generatedRouteTree: './src/app/routeTree.gen.ts',
      }),
      react(),
      tsconfigPaths(),
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
      outDir: 'dist/client',
    },
  };
});
