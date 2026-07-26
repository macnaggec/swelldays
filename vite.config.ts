import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Configurable so a second instance (e.g. the visual-capture run, which needs a
// different database) can run alongside an ordinary dev server. Defaults unchanged.
const clientPort = Number(process.env.CLIENT_PORT ?? 3000);
const apiPort = Number(process.env.SERVER_PORT ?? 3001);

export default defineConfig({
  envPrefix: 'VITE_',
  plugins: [
    tanstackRouter({
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    tsconfigPaths(),
  ],
  server: {
    port: clientPort,
    allowedHosts: true,
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
});
