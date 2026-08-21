import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadToCloudinary } from 'features/Upload/model/cloudinaryTransport';

// Allow the Cloudinary URL schema refine to pass for this cloud name
const CLOUD_NAME = 'test-cloud';
vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', CLOUD_NAME);

const baseParams = {
  signature: 'sig',
  timestamp: 1234567890,
  apiKey: 'key',
  cloudName: CLOUD_NAME,
  publicId: 'swelldays/users/abc/test-uuid',
  eager: 't_swelldays_thumbnail|t_swelldays_lightbox_watermark',
};

const testFile = new File(['pixel'], 'photo.jpg', { type: 'image/jpeg' });

afterEach(() => vi.restoreAllMocks());

/**
 * Intercept XHR send() and simulate a synchronous load event with the
 * given status + response body. Uses Object.defineProperty to shadow the
 * read-only XHR status/responseText accessors on the instance.
 */
function simulateLoad(status: number, body: string) {
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementationOnce(function(this: XMLHttpRequest) {
    const self = this as unknown as Record<string, unknown>;
    setTimeout(() => {
      Object.defineProperty(self, 'status', { value: status, configurable: true });
      Object.defineProperty(self, 'responseText', { value: body, configurable: true });
      (this.onload as ((e: ProgressEvent) => void) | null)?.(new ProgressEvent('load'));
    }, 0);
  });
}

describe('uploadToCloudinary — XHR lifecycle', () => {
  it('rejects with NETWORK_ERROR when aborted before load', async () => {
    const { promise, abort } = uploadToCloudinary({ ...baseParams, file: testFile });
    abort();
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('rejects with CLOUDINARY_REJECTED on 4xx, forwarding the Cloudinary error message', async () => {
    simulateLoad(400, JSON.stringify({ error: { message: 'Invalid signature' } }));
    const { promise } = uploadToCloudinary({ ...baseParams, file: testFile });
    await expect(promise).rejects.toMatchObject({
      code: 'CLOUDINARY_REJECTED',
      message: 'Invalid signature',
    });
  });

  it('rejects with INVALID_RESPONSE on 200 with a non-JSON body', async () => {
    simulateLoad(200, 'not-valid-json');
    const { promise } = uploadToCloudinary({ ...baseParams, file: testFile });
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects with INVALID_RESPONSE on 200 when eager transforms are absent', async () => {
    // Cloudinary returned 200 but did not include eager variants (e.g. named transform missing)
    simulateLoad(200, JSON.stringify({ public_id: 'swelldays/img', resource_type: 'image' }));
    const { promise } = uploadToCloudinary({ ...baseParams, file: testFile });
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('resolves with publicId, thumbnailUrl, and lightboxUrl from eager[0] and eager[1]', async () => {
    const base = `https://res.cloudinary.com/${CLOUD_NAME}/image/authenticated`;
    const thumbnailUrl = `${base}/t_swelldays_thumbnail/swelldays/img`;
    const lightboxUrl = `${base}/t_swelldays_lightbox_watermark/swelldays/img`;

    simulateLoad(200, JSON.stringify({
      public_id: 'swelldays/img',
      resource_type: 'image',
      eager: [{ secure_url: thumbnailUrl }, { secure_url: lightboxUrl }],
    }));

    const { promise } = uploadToCloudinary({ ...baseParams, file: testFile });
    await expect(promise).resolves.toMatchObject({
      publicId: 'swelldays/img',
      thumbnailUrl,
      lightboxUrl,
      resourceType: 'image',
    });
  });
});
