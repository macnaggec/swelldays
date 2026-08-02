export const PANEL_COLLECTION_SCROLL_CORRECTION_ATTRIBUTE =
  'data-panel-collection-scroll-correction';

const MUTATING_SCROLL_POSITION = 'mutating';

export function beginPanelCollectionScrollCorrection(scrollOwner: HTMLElement): void {
  scrollOwner.setAttribute(
    PANEL_COLLECTION_SCROLL_CORRECTION_ATTRIBUTE,
    MUTATING_SCROLL_POSITION,
  );
}

export function settlePanelCollectionScrollCorrection(scrollOwner: HTMLElement): void {
  scrollOwner.setAttribute(
    PANEL_COLLECTION_SCROLL_CORRECTION_ATTRIBUTE,
    String(scrollOwner.scrollTop),
  );
}

export function endPanelCollectionScrollCorrection(scrollOwner: HTMLElement): void {
  scrollOwner.removeAttribute(PANEL_COLLECTION_SCROLL_CORRECTION_ATTRIBUTE);
}

export function isPanelCollectionScrollCorrection(scrollTarget: HTMLElement): boolean {
  const scrollOwner = scrollTarget.closest<HTMLElement>(
    `[${PANEL_COLLECTION_SCROLL_CORRECTION_ATTRIBUTE}]`,
  );
  if (!scrollOwner || scrollOwner !== scrollTarget) return false;

  const marker = scrollOwner.getAttribute(PANEL_COLLECTION_SCROLL_CORRECTION_ATTRIBUTE);
  if (marker === null) return false;

  const settledScrollTop = marker.trim() === '' ? Number.NaN : Number(marker);
  return !Number.isFinite(settledScrollTop) || settledScrollTop === scrollOwner.scrollTop;
}
