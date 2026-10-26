/** Adopt the server-positioned welcome without moving its already-painted nodes. */
export function preserveInitialWelcome(root: HTMLElement): void {
  const initial = root.ownerDocument.querySelector<HTMLElement>('[data-first-visit-initial]');
  if (!initial) return;
  if (document.documentElement.getAttribute('data-first-visit-startup') === 'app') {
    // Returning/direct visits never painted this hidden document. Let React own
    // any later request to open the welcome instead of retaining a hidden copy.
    initial.remove();
    return;
  }
  initial.querySelector('[data-first-visit-startup-error]')?.remove();
  initial.setAttribute('data-first-visit-preserved', '');
}
