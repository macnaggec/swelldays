import { describe, expect, it } from 'vitest';
import {
  mediaCloudinaryResultSchema,
  mediaCreateSchema,
} from 'shared/validation/mediaSchemas';

const CLOUDINARY_BASE = 'https://res.cloudinary.com/test-cloud/';

describe('mediaCloudinaryResultSchema', () => {
  const validResult = {
    publicId: 'swelldays/users/abc/img',
    thumbnailUrl: `${CLOUDINARY_BASE}t_swelldays_thumbnail/swelldays/users/abc/img.jpg`,
    lightboxUrl: `${CLOUDINARY_BASE}t_swelldays_lightbox_watermark/swelldays/users/abc/img.jpg`,
  };

  it.each(['image', 'video'])('accepts the %s resource type', (resourceType) => {
    expect(mediaCloudinaryResultSchema.safeParse({ ...validResult, resourceType }).success).toBe(true);
  });

  it.each(['raw', 'script'])('rejects the %s resource type', (resourceType) => {
    expect(mediaCloudinaryResultSchema.safeParse({ ...validResult, resourceType }).success).toBe(false);
  });
});

describe('mediaCreateSchema', () => {
  it('rejects an uploaded asset that is not assigned to a draft session', () => {
    const result = mediaCreateSchema.safeParse({
      cloudinaryResult: {
        publicId: 'swelldays/users/user-1/photo-1',
        thumbnailUrl: 'https://res.cloudinary.com/test/thumb.jpg',
        lightboxUrl: 'https://res.cloudinary.com/test/full.jpg',
        resourceType: 'image',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'draftId')).toBe(true);
    }
  });
});
