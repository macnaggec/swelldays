import { describe, expect, it } from 'vitest';
import {
  MIN_MEDIA_PRICE_CENTS,
  mediaBatchUpdateSchema,
  mediaUpdateSchema,
} from '@wave-atlas/contracts';

const mediaId = '11111111-1111-4111-8111-111111111111';

describe('media update contracts', () => {
  it('rejects single-media prices below the project price floor', () => {
    expect(mediaUpdateSchema.safeParse({
      id: mediaId,
      price: MIN_MEDIA_PRICE_CENTS - 1,
    }).success).toBe(false);
  });

  it('rejects batch prices below the project price floor', () => {
    expect(mediaBatchUpdateSchema.safeParse({
      mediaIds: [mediaId],
      price: MIN_MEDIA_PRICE_CENTS - 1,
    }).success).toBe(false);
  });
});
