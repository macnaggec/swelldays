import { describe, expect, it, beforeAll } from 'vitest';
import cloudinary, { generateDeliveryUrl, getWatermarkedPreviewTransform } from 'server/providers/cloudinary';
import { MEDIA_CLOUDINARY_TRANSFORMS } from 'server/providers/cloudinary';

beforeAll(() => {
  cloudinary.config({
    cloud_name: 'test-cloud',
    api_key: 'test-key',
    api_secret: 'test-secret',
    secure: true,
  });
});

describe('generateDeliveryUrl', () => {
  const publicId = 'swelldays/users/user1/abc123';

  it('produces an /image/authenticated/ URL for image resources', () => {
    const url = generateDeliveryUrl(publicId, MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL, 'image');
    expect(url).toContain('/image/authenticated/');
    expect(url).not.toContain('/video/');
  });

  it('produces a /video/authenticated/ URL for video resources', () => {
    const url = generateDeliveryUrl(publicId, MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL, 'video');
    expect(url).toContain('/video/authenticated/');
    expect(url).not.toContain('/image/');
  });

  it('appends .jpg extension when format=jpg is requested (video poster frame)', () => {
    const url = generateDeliveryUrl(publicId, MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL, 'video', 'jpg');
    expect(url).toContain('/video/authenticated/');
    // Cloudinary encodes the format as a .jpg file extension on the public_id segment
    expect(url).toMatch(/abc123\.jpg/);
  });

  it('does not force a jpg extension for video lightbox URLs (deliver as native video)', () => {
    const url = generateDeliveryUrl(publicId, getWatermarkedPreviewTransform('video'), 'video');
    expect(url).toContain('/video/authenticated/');
    expect(url).not.toMatch(/abc123\.jpg/);
  });
});
