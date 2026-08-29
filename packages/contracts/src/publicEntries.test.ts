import { describe, expect, it } from 'vitest';
import { MEDIA_STATUS, MIN_MEDIA_PRICE_CENTS } from '@swelldays/contracts/core';
import { createCheckoutSchema } from '@swelldays/contracts/validation/checkout';
import { mediaUpdateSchema } from '@swelldays/contracts/validation/media';
import { spotLocationSchema } from '@swelldays/contracts/validation/spot';
import { beginLocalSchema } from '@swelldays/contracts/validation/upload';

describe('contracts public entries', () => {
  it('exposes the Zod-free core runtime surface', () => {
    expect(MEDIA_STATUS.PUBLISHED).toBe('PUBLISHED');
    expect(MIN_MEDIA_PRICE_CENTS).toBeGreaterThan(0);
  });

  it('exposes checkout validation', () => {
    expect(createCheckoutSchema.safeParse({}).success).toBe(false);
  });

  it('exposes media validation', () => {
    expect(mediaUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('exposes spot validation', () => {
    expect(spotLocationSchema.safeParse({}).success).toBe(false);
  });

  it('exposes upload validation', () => {
    expect(beginLocalSchema.safeParse({}).success).toBe(false);
  });
});
