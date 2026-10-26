import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin, PluginOption } from 'vite';
import viteConfig from '../vite.config';
import { FIRST_VISIT_STORAGE_KEY } from '../src/features/FirstVisit/model/firstVisitStorage';

vi.mock('../src/config/decodeWebEnvironment', () => ({ decodeWebEnvironment: () => ({}) }));

async function flatten(options: PluginOption[]): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  for (const option of options) {
    const plugin = await option;
    if (Array.isArray(plugin)) plugins.push(...await flatten(plugin));
    else if (plugin) plugins.push(plugin);
  }
  return plugins;
}

async function startupScript() {
  const config = viteConfig({ mode: 'production', command: 'build' });
  const plugins = await flatten(config.plugins ?? []);
  const plugin = plugins.find((item) => item.name === 'swelldays-first-visit-bootstrap');
  expect(plugin, 'An inline head script must select the initial screen before React starts').toBeDefined();
  const hook = plugin?.transformIndexHtml;
  if (!hook || typeof hook !== 'object' || !('handler' in hook)) throw new Error('Missing HTML bootstrap hook');
  const tags = await hook.handler('', { path: '/', filename: 'index.html' });
  if (!Array.isArray(tags)) throw new Error('Missing bootstrap script tag');
  const script = tags.find((tag) => tag.tag === 'script');
  if (!script || typeof script.children !== 'string') throw new Error('Missing inline script');
  expect(script.injectTo).toBe('head');
  expect(script.attrs?.type).not.toBe('module');
  return script.children;
}

describe('first-visit screen before the application entry', () => {
  it.each([false, true])('activates welcome-only resource hints only when seen=%s resolves to intro', async (seen) => {
    const media = { font: 'not all', portrait: 'not all', landscape: 'not all' };
    const links = Object.keys(media).map((key) => ({
      getAttribute: () => key === 'font' ? null : key === 'portrait' ? '(width < 48em)' : '(width >= 48em)',
      setAttribute: (name: string, value: string) => Reflect.set(media, key, name === 'media' ? value : 'unexpected attribute'),
    }));
    runInNewContext(await startupScript(), {
      URLSearchParams,
      window: { location: new URL('https://swelldays.surf/'), localStorage: { getItem: () => seen ? 'seen' : null } },
      document: { documentElement: { setAttribute: vi.fn() }, querySelectorAll: () => links },
    });
    expect(media).toEqual(seen
      ? { font: 'not all', portrait: 'not all', landscape: 'not all' }
      : { font: 'all', portrait: '(width < 48em)', landscape: '(width >= 48em)' });
  });
  it.each([
    { href: '/', seen: false, expected: null },
    { href: '/', seen: true, expected: 'app' },
    { href: '/#map', seen: false, expected: 'app' },
    { href: '/#intro', seen: true, expected: null },
    { href: '/?firstVisitReview=1', seen: true, expected: null },
    { href: '/?firstVisitReview=1#map', seen: true, expected: 'app' },
  ])('$href with seen=$seen selects $expected before the module runs', async ({ href, seen, expected }) => {
    const attributes = new Map<string, string>();
    runInNewContext(await startupScript(), {
      URLSearchParams,
      window: {
        location: new URL(href, 'https://swelldays.surf'),
        localStorage: { getItem: (key: string) => key === FIRST_VISIT_STORAGE_KEY && seen ? 'seen' : null },
      },
      document: { documentElement: { setAttribute: (key: string, value: string) => attributes.set(key, value) }, querySelectorAll: () => [] },
    });
    expect(attributes.get('data-first-visit-startup') ?? null).toBe(expected);
  });

  it('keeps a first visit readable when access to localStorage itself throws', async () => {
    const setAttribute = vi.fn();
    runInNewContext(await startupScript(), {
      URLSearchParams,
      window: {
        location: new URL('https://swelldays.surf/'),
        get localStorage() { throw new Error('Storage blocked'); },
      },
      document: { documentElement: { setAttribute }, querySelectorAll: () => [] },
    });
    expect(setAttribute).not.toHaveBeenCalled();
  });
});
