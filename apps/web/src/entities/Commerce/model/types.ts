import type { Cents } from '@wave-atlas/contracts';

export interface CartItem {
  /** Opaque item identifier — the purchasing layer resolves what it points to */
  id: string;
  /** Human-readable combined label (e.g. "Uluwatu · Apr 1, 2026") — used for accessibility/alt text */
  label: string;
  /** Spot name for discrete display */
  spotName: string;
  /** Capture date as ISO string — format at render time with formatShortDate */
  capturedAt: string;
  thumbnailUrl: string;
  /** Watermarked full-size URL for lightbox preview */
  lightboxUrl: string;
  /** Price in cents (e.g. 300 = $3.00). Integer to avoid floating-point errors. */
  priceCents: Cents;
}
