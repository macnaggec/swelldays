import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { transformWithEsbuild, type Plugin } from 'vite';

/** Run the feature's existing decision before the initial document can paint. */
export function createFirstVisitBootstrapPlugin(webDirectory: string): Plugin {
  return {
    name: 'swelldays-first-visit-bootstrap',
    transformIndexHtml: {
      order: 'post',
      async handler() {
        const policy = await readFile(resolve(webDirectory, 'src/features/FirstVisit/model/firstVisitPolicy.ts'), 'utf8');
        const { code } = await transformWithEsbuild(`${policy}
          let hasVisited = false;
          try {
            hasVisited = window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY) === FIRST_VISIT_ACKNOWLEDGEMENT;
          } catch {}
          const presentation = resolveFirstVisitPresentation({
            isEligibleRoute: window.location.pathname === '/',
            isSessionLoading: false,
            isAuthenticated: false,
            hasVisited,
            intent: resolveFirstVisitIntent(window.location.hash, window.location.search),
          });
          if (presentation === 'hidden') document.documentElement.setAttribute('data-first-visit-startup', 'app');
        `, 'first-visit-bootstrap.ts', { loader: 'ts', format: 'iife', minify: true, target: 'es2018' });
        return [{ tag: 'script', attrs: { 'data-first-visit-bootstrap': '' }, children: code, injectTo: 'head' }];
      },
    },
  };
}
