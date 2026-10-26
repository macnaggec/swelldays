/** Preserve painted nodes so background React startup cannot create a late welcome LCP. */
export function preserveInitialWelcome(root: HTMLElement): void {
  if (document.documentElement.getAttribute('data-first-visit-startup') === 'app') return;
  const initial = root.querySelector<HTMLElement>('[data-first-visit-initial]');
  if (!initial) return;
  initial.querySelector('[data-first-visit-startup-error]')?.remove();
  initial.setAttribute('data-first-visit-preserved', '');
  root.after(initial);
}
