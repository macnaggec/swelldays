import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapApplication } from './bootstrapApplication';

describe('welcome application scheduling', () => {
  let settleImage: () => void;
  let failImage: () => void;
  let idle: () => void;
  let requestedImages: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    requestedImages = [];
    document.documentElement.removeAttribute('data-first-visit-startup');
    document.documentElement.removeAttribute('data-first-visit-enter-requested');
    document.head.innerHTML = '<link data-first-visit-background media="(width < 48em)" href="/portrait.webp"><link data-first-visit-background media="(width >= 48em)" href="/landscape.webp">';
    document.body.innerHTML = '<div data-first-visit-initial><div data-first-visit-part="plate" style="background-image: url(/portrait.webp)"></div><a href="/#map">Find my photos</a></div>';
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { idle = callback; return 1; });
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        requestedImages.push(url);
        settleImage = () => this.onload?.();
        failImage = () => this.onerror?.();
      }
      decode() { return Promise.resolve(); }
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.head.innerHTML = ''; document.body.innerHTML = ''; });

  it('waits for the selected background, two frames, and idle time', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    expect(requestedImages).toEqual(['/portrait.webp']);
    expect(load).not.toHaveBeenCalled();
    settleImage();
    await vi.advanceTimersByTimeAsync(40);
    expect(load).not.toHaveBeenCalled();
    idle();
    expect(load).toHaveBeenCalledOnce();
    cleanup();
  });
  it.each(['error', 'timeout'])('continues when the background settles through %s', async (kind) => {
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    if (kind === 'error') failImage();
    await vi.advanceTimersByTimeAsync(kind === 'timeout' ? 3040 : 40);
    idle();
    expect(load).toHaveBeenCalledOnce();
    cleanup();
  });
  it('starts immediately on entry and shares that load with the background scheduler', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    const link = document.querySelector('a')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(load).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveAttribute('data-first-visit-enter-requested');
    settleImage();
    await vi.advanceTimersByTimeAsync(3040);
    expect(load).toHaveBeenCalledOnce();
    cleanup();
  });
  it('does not intercept modified entry links', () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    document.querySelector('a')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(load).not.toHaveBeenCalled();
    cleanup();
  });
  it('hands entry events and pending work to the committed welcome gate', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    document.dispatchEvent(new Event('swelldays:welcome-ready'));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')!.dispatchEvent(event);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(event.defaultPrevented).toBe(false);
    expect(load).not.toHaveBeenCalled();
    cleanup();
  });
  it('delivers a pending entry after the welcome gate has attached its listeners', () => {
    const cleanup = bootstrapApplication(vi.fn().mockResolvedValue(undefined));
    const link = document.querySelector('a')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    const receiveEntry = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', receiveEntry);
    document.dispatchEvent(new Event('swelldays:welcome-ready'));
    expect(receiveEntry).toHaveBeenCalledOnce();
    cleanup();
  });
  it('starts returning visits and direct pages without waiting for welcome assets', () => {
    document.documentElement.setAttribute('data-first-visit-startup', 'app');
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    expect(load).toHaveBeenCalledOnce();
    expect(requestedImages).toEqual([]);
    cleanup();
  });
  it('starts without waiting when there is no server-rendered welcome', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    expect(load).toHaveBeenCalledOnce();
    cleanup();
  });
  it('uses a task after two frames when requestIdleCallback is unavailable', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = bootstrapApplication(load);
    failImage();
    await vi.advanceTimersByTimeAsync(50);
    expect(load).toHaveBeenCalledOnce();
    cleanup();
  });
});
