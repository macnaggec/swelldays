import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cloudinary from 'server/providers/cloudinary';
import { InternalServerError } from 'server/errors';
import { CloudinaryService } from 'server/services/CloudinaryService';

const FIXED_NOW = new Date('2026-07-15T22:00:00Z');
const EXPECTED_EXPIRES_AT = Math.floor(FIXED_NOW.getTime() / 1000) + 600;

function expectSignedPrivateDownload(
  downloadUrl: string,
  expected: { publicId: string; format: string; resourceType: 'image' | 'video' },
): void {
  const url = new URL(downloadUrl);
  const timestamp = url.searchParams.get('timestamp');
  const expiresAt = url.searchParams.get('expires_at');

  expect(url.hostname).toBe('api.cloudinary.com');
  expect(url.pathname).toBe(`/v1_1/test-cloud/${expected.resourceType}/download`);
  expect(url.searchParams.get('public_id')).toBe(expected.publicId);
  expect(url.searchParams.get('format')).toBe(expected.format);
  expect(url.searchParams.get('type')).toBe('authenticated');
  expect(url.searchParams.get('attachment')).toBe('true');
  expect(expiresAt).toBe(String(EXPECTED_EXPIRES_AT));
  expect(timestamp).not.toBeNull();

  const expectedSignature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      public_id: expected.publicId,
      format: expected.format,
      type: 'authenticated',
      attachment: 'true',
      expires_at: expiresAt,
    },
    'test-secret',
  );

  expect(url.searchParams.get('signature')).toBe(expectedSignature);
}

beforeAll(() => {
  cloudinary.config({
    cloud_name: 'test-cloud',
    api_key: 'test-key',
    api_secret: 'test-secret',
    secure: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
  it('returns a signed, expiring private download URL for the original photo format', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const resourceLookup = vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({ format: 'jpg' });
    const service = new CloudinaryService();
    const publicId = 'swelldays/users/photographer/photo-1';

    const result = await service.generateSignedDownload(publicId, 'image');

    expect(resourceLookup).toHaveBeenCalledWith(publicId, {
      resource_type: 'image',
      type: 'authenticated',
    });
    expect(result.expiresAt).toBe(EXPECTED_EXPIRES_AT);
    expectSignedPrivateDownload(result.downloadUrl, {
      publicId,
      format: 'jpg',
      resourceType: 'image',
    });
  });

  it('returns a signed, expiring private download URL for the original video format', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const resourceLookup = vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({ format: 'mp4' });
    const service = new CloudinaryService();
    const publicId = 'swelldays/users/photographer/video-1';

    const result = await service.generateSignedDownload(publicId, 'video');

    expect(resourceLookup).toHaveBeenCalledWith(publicId, {
      resource_type: 'video',
      type: 'authenticated',
    });
    expect(result.expiresAt).toBe(EXPECTED_EXPIRES_AT);
    expectSignedPrivateDownload(result.downloadUrl, {
      publicId,
      format: 'mp4',
      resourceType: 'video',
    });
  });

  it('rejects an invalid original format returned by Cloudinary', async () => {
    vi.spyOn(cloudinary.api, 'resource').mockResolvedValue({ format: '   ' });
    const service = new CloudinaryService();

    await expect(service.generateSignedDownload('swelldays/users/photographer/photo-1'))
      .rejects.toEqual(new InternalServerError('Cloudinary returned an invalid original asset format'));
  });
});
