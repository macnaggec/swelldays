import { describe, expect, it } from 'vitest';
import type { DraftMedia } from 'entities/Media';
import type { GalleryCard } from './types';
import {
  deriveSessionDateFromCaptures,
  getKnownCapturedDates,
  hasSessionDateMismatch,
} from './sessionDateFromCaptures';

// capturedAt's UTC-labelled fields hold the camera's local wall-clock time.
const capturedAt = (h: number, m: number, day = 1) => new Date(Date.UTC(2026, 4, day, h, m));

function mediaItem(id: string, captured: Date): DraftMedia {
  return {
    id,
    sessionId: 'session-1',
    photographerId: 'photographer-1',
    type: 'PHOTO',
    spotId: null,
    capturedAt: captured,
    price: null,
    lightboxUrl: `https://cdn.example.com/${id}.jpg`,
    thumbnailUrl: `https://cdn.example.com/${id}-thumb.jpg`,
    cloudinaryPublicId: id,
    status: 'DRAFT',
    createdAt: captured,
    resource: {
      resourceType: 'image',
      url: `https://cdn.example.com/${id}.jpg`,
      assetId: `asset-${id}`,
    },
  };
}

describe('getKnownCapturedDates', () => {
  it('reads capturedAt from ready cards and from attempt cards with resolved EXIF', () => {
    const cards = [
      { kind: 'asset', id: 'draft-1', result: mediaItem('draft-1', capturedAt(8, 5)) },
      {
        kind: 'attempt',
        id: 'upload-2',
        source: 'LOCAL' as const,
        status: 'ACQUIRING' as const,
        previewUrl: 'blob:active',
        resourceType: 'image' as const,
        capturedAt: capturedAt(9, 0),
      },
      {
        kind: 'attempt',
        id: 'upload-3',
        source: 'LOCAL' as const,
        status: 'pending' as const,
        previewUrl: 'blob:pending',
        resourceType: 'image' as const,
        // capturedAt not yet resolved
      },
    ] satisfies GalleryCard[];

    expect(getKnownCapturedDates(cards)).toEqual([capturedAt(8, 5), capturedAt(9, 0)]);
  });
});

describe('deriveSessionDateFromCaptures', () => {
  it('returns null when there are no known captures', () => {
    expect(deriveSessionDateFromCaptures([])).toBeNull();
  });

  it('returns the shared day when every capture agrees, regardless of time-of-day', () => {
    const result = deriveSessionDateFromCaptures([capturedAt(8, 7), capturedAt(23, 52)]);

    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(4);
    expect(result?.getDate()).toBe(1);
  });

  it('returns null when captures span more than one calendar day', () => {
    const result = deriveSessionDateFromCaptures([capturedAt(8, 0, 1), capturedAt(9, 0, 2)]);

    expect(result).toBeNull();
  });
});

describe('hasSessionDateMismatch', () => {
  it('is false when no session date has been chosen yet', () => {
    expect(hasSessionDateMismatch(null, [capturedAt(8, 0)])).toBe(false);
  });

  it('is false when every capture falls on the session date', () => {
    const sessionDate = new Date(2026, 4, 1);
    expect(hasSessionDateMismatch(sessionDate, [capturedAt(8, 0), capturedAt(20, 0)])).toBe(false);
  });

  it('is true when a capture falls on a different day than the session date', () => {
    const sessionDate = new Date(2026, 4, 1);
    expect(hasSessionDateMismatch(sessionDate, [capturedAt(8, 0, 1), capturedAt(9, 0, 2)])).toBe(true);
  });
});
