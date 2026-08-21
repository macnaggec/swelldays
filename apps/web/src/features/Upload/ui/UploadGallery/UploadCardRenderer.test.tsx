import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { MEDIA_STATUS } from 'entities/Media';
import type { DraftMedia } from 'entities/Media';
import { UploadCardRenderer } from './UploadCardRenderer';
import type { GalleryCard } from '../../model';

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function makeDraft(overrides: Partial<DraftMedia>): GalleryCard {
  const base: DraftMedia = {
    id: 'media-1',
    sessionId: 'session-1',
    photographerId: 'user-1',
    type: 'PHOTO',
    spotId: null,
    capturedAt: new Date('2024-01-01'),
    price: null,
    lightboxUrl: 'https://cdn.example.com/light.mp4',
    thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
    cloudinaryPublicId: 'swelldays/users/user-1/abc',
    status: MEDIA_STATUS.DRAFT,
    createdAt: new Date(),
    resource: {
      resourceType: 'image',
      url: 'https://cdn.example.com/light.jpg',
      assetId: 'abc',
    },
    ...overrides,
  };
  return { kind: 'asset', id: base.id, result: base };
}

describe('UploadCardRenderer — draft cards', () => {
  it('uses thumbnailUrl (JPEG poster frame) as <img> src for video drafts', () => {
    const videoUrl = 'https://cdn.example.com/video-clip.mp4';
    const thumbUrl = 'https://cdn.example.com/poster-frame.jpg';

    const item = makeDraft({
      resource: { resourceType: 'video', url: videoUrl, assetId: 'vid-1' },
      thumbnailUrl: thumbUrl,
    });

    const { container } = wrap(<UploadCardRenderer item={item} />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(thumbUrl);

    // Video clip URL must NOT be used as the image src
    expect(img!.getAttribute('src')).not.toBe(videoUrl);
    expect(container.querySelector('video')).toBeNull();
  });

  it('uses thumbnailUrl as <img> src for image drafts', () => {
    const thumbUrl = 'https://cdn.example.com/thumb.jpg';

    const item = makeDraft({
      resource: { resourceType: 'image', url: 'https://cdn.example.com/lightbox.jpg', assetId: 'img-1' },
      thumbnailUrl: thumbUrl,
    });

    const { container } = wrap(<UploadCardRenderer item={item} />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(thumbUrl);
  });
});
