/** Keep the public welcome readable while the full application loads. */
export function bootstrapApplication(loadApplication: () => Promise<unknown>): () => void {
  let loading: Promise<unknown> | undefined;
  let disposed = false;
  let timeout: number | undefined;
  let firstFrame: number | undefined;
  let secondFrame: number | undefined;
  let idle: number | undefined;
  let image: HTMLImageElement | undefined;
  let backgroundSettled = false;

  const start = () => {
    if (disposed || loading) return;
    loading = loadApplication().catch(() => {
      loading = undefined;
      const initial = document.querySelector('[data-first-visit-initial]');
      if (!initial || initial.querySelector('[data-first-visit-startup-error]')) return;
      const message = document.createElement('p');
      message.setAttribute('data-first-visit-startup-error', '');
      message.setAttribute('role', 'alert');
      message.textContent = 'Unable to load the app. Try Find my photos again or reload the page.';
      initial.append(message);
    });
  };
  const onEntry = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element) || !event.target.closest('[data-first-visit-initial] a[href="/#map"]')) return;
    event.preventDefault();
    document.documentElement.setAttribute('data-first-visit-enter-requested', String(Date.now()));
    document.documentElement.setAttribute('data-first-visit-enter-keyboard', String(event.detail === 0));
    start();
  };
  const cleanup = () => {
    disposed = true;
    document.removeEventListener('click', onEntry);
    document.removeEventListener('swelldays:welcome-ready', onWelcomeReady);
    window.clearTimeout(timeout);
    if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame);
    if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    if (image) { image.onload = null; image.onerror = null; }
  };
  const onWelcomeReady = () => {
    const requested = document.documentElement.hasAttribute('data-first-visit-enter-requested');
    const keyboard = document.documentElement.getAttribute('data-first-visit-enter-keyboard') === 'true';
    cleanup();
    // A click can arrive during concurrent React rendering, after the gate read
    // its initial state. Deliver it once its native listener has actually committed.
    if (requested) document.querySelector('[data-first-visit-initial] a[href="/#map"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: keyboard ? 0 : 1 }),
    );
  };

  if (document.documentElement.getAttribute('data-first-visit-startup') === 'app'
    || window.location.hash === '#map' || !document.querySelector('[data-first-visit-initial]')) {
    start();
    return cleanup;
  }
  document.addEventListener('click', onEntry);
  document.addEventListener('swelldays:welcome-ready', onWelcomeReady, { once: true });
  const afterBackground = () => {
    if (backgroundSettled || disposed || loading) return;
    backgroundSettled = true;
    window.clearTimeout(timeout);
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(start, { timeout: 1_000 });
        else timeout = window.setTimeout(start, 0);
      });
    });
  };
  // Read the asset actually selected by CSS; do not recreate viewport policy in JS.
  const plate = document.querySelector('[data-first-visit-initial] [data-first-visit-part="plate"]');
  const background = plate ? /url\(["']?([^"')]+)["']?\)/.exec(window.getComputedStyle(plate).backgroundImage)?.[1] : undefined;
  timeout = window.setTimeout(afterBackground, 3_000);
  if (background) {
    image = new Image();
    image.onload = () => {
      if (image?.decode) void image.decode().then(afterBackground, afterBackground);
      else afterBackground();
    };
    image.onerror = afterBackground;
    image.src = background;
  } else afterBackground();
  return cleanup;
}
