import { afterEach, describe, expect, it } from 'vitest';
import { preserveInitialWelcome } from './preserveInitialWelcome';

afterEach(() => { document.body.innerHTML = ''; document.documentElement.removeAttribute('data-first-visit-startup'); });
describe('initial welcome ownership', () => {
  it('keeps the painted document nodes outside the root that React will replace', () => {
    document.body.innerHTML = '<div id="root"><div data-first-visit-initial><h1>Welcome</h1></div><div data-first-visit-loader></div></div>';
    const heading = document.querySelector('h1');
    const root = document.getElementById('root')!;
    preserveInitialWelcome(root);
    root.replaceChildren(document.createElement('main'));
    expect(document.querySelector('h1')).toBe(heading);
    expect(heading?.closest('[data-first-visit-preserved]')).not.toBeNull();
    expect(root.querySelector('[data-first-visit-initial]')).toBeNull();
  });
  it('does not preserve a welcome that the startup policy has hidden', () => {
    document.body.innerHTML = '<div id="root"><div data-first-visit-initial><h1>Welcome</h1></div></div>';
    document.documentElement.setAttribute('data-first-visit-startup', 'app');
    const root = document.getElementById('root')!;
    preserveInitialWelcome(root);
    expect(document.querySelector('[data-first-visit-preserved]')).toBeNull();
    expect(root.querySelector('h1')).not.toBeNull();
  });
  it('removes an obsolete startup error when a later application load succeeds', () => {
    document.body.innerHTML = '<div id="root"><div data-first-visit-initial><h1>Welcome</h1><p data-first-visit-startup-error role="alert">Failed to load</p></div></div>';
    preserveInitialWelcome(document.getElementById('root')!);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Welcome');
  });
});
