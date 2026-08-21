import { beforeAll, describe, expect, it } from 'vitest';
import cloudinary from 'server/providers/cloudinary';
import { CloudinaryService } from 'server/services/CloudinaryService';

beforeAll(() => {
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  process.env.VITE_CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.VITE_CLOUDINARY_API_KEY = 'test-key';
  cloudinary.config({
    cloud_name: 'test-cloud',
    api_key: 'test-key',
    api_secret: 'test-secret',
    secure: true,
  });
});

describe('CloudinaryService.createUploadGrant', () => {
  it('applies the video watermark named transformation to video previews', () => {
    const service = new CloudinaryService();

    const grant = service.createUploadGrant(
      {
        cloudinaryPublicId: 'swelldays/users/photographer/video-1',
        expectedMediaType: 'VIDEO',
        photographerId: 'photographer',
      },
      new Date('2026-07-15T22:00:00Z'),
    );
    const previewTransform = grant.eager.split('|')[1] ?? '';

    // Video watermarking is handled the same way as images — a dashboard named
    // transformation — since the pre-tiled PNG overlay it uses needs no per-frame grid.
    expect(previewTransform).toBe('t_swelldays_video_lightbox_watermark');
  });
});

describe('CloudinaryService.generateSignedDownload', () => {
  it('uses Cloudinary video delivery for a purchased video', () => {
    const service = new CloudinaryService();

    const { downloadUrl } = service.generateSignedDownload(
      'swelldays/users/photographer/video-1',
      'video',
    );

    expect(new URL(downloadUrl).pathname).toContain('/video/authenticated/');
  });
});
