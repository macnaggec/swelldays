import { afterEach, describe, expect, it } from 'vitest';
import { preserveInitialWelcome } from './preserveInitialWelcome';

afterEach(() => { document.body.innerHTML = ''; document.documentElement.removeAttribute('data-first-visit-startup'); });
describe('initial welcome ownership', () => {
  it('keeps the painted document in its original position when React starts', () => {
    document.body.innerHTML = '<div data-first-visit-initial><h1>Welcome</h1></div><div id="root"><div data-first-visit-loader></div></div>';
    const initial = document.querySelector('[data-first-visit-initial]');
    const parent = initial?.parentNode;
    const nextSibling = initial?.nextSibling;
    const observer = new MutationObserver(() => undefined);
    observer.observe(document.body, { childList: true, subtree: true });
    const heading = document.querySelector('h1');
    const root = document.getElementById('root')!;
    preserveInitialWelcome(root);
    expect(initial?.parentNode).toBe(parent);
    expect(initial?.nextSibling).toBe(nextSibling);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    root.replaceChildren(document.createElement('main'));
    expect(document.querySelector('h1')).toBe(heading);
    expect(heading?.closest('[data-first-visit-preserved]')).not.toBeNull();
    expect(root.querySelector('[data-first-visit-initial]')).toBeNull();
  });
  it('removes the never-painted welcome on a returning or direct visit so it cannot mask a later intro', () => {
    document.body.innerHTML = '<div data-first-visit-initial data-first-visit-preserved><h1>Welcome</h1></div><div id="root"><div data-first-visit-loader></div></div>';
    document.documentElement.setAttribute('data-first-visit-startup', 'app');
    const root = document.getElementById('root')!;
    preserveInitialWelcome(root);
    expect(document.querySelector('[data-first-visit-preserved]')).toBeNull();
    expect(document.querySelector('[data-first-visit-initial]')).toBeNull();
    expect(root.querySelector('[data-first-visit-loader]')).not.toBeNull();
  });
  it('removes an obsolete startup error when a later application load succeeds', () => {
    document.body.innerHTML = '<div data-first-visit-initial><h1>Welcome</h1><p data-first-visit-startup-error role="alert">Failed to load</p></div><div id="root"></div>';
    preserveInitialWelcome(document.getElementById('root')!);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Welcome');
  });
});
