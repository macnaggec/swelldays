import { describe, expect, it } from 'vitest';
import { FEE_POLICY_VERSIONS, requireOrderLineSnapshot, snapshotOrderLine } from './OrderEconomics';

const item = {
  id: 'media-1',
  status: 'PUBLISHED',
  price: 333,
  photographerId: 'seller-1',
  cloudinaryPublicId: 'waves/photo-1',
  type: 'PHOTO' as const,
};

describe('snapshotOrderLine', () => {
  it.each(['mock', 'cryptocloud'] as const)('uses the conserving standard policy for %s', (provider) => {
    expect(snapshotOrderLine(item, provider)).toEqual({
      mediaItemId: 'media-1',
      unitAmountCents: 333,
      currency: 'USD',
      sellerId: 'seller-1',
      feePolicyVersion: 'standard-20-v1',
      platformFeeAmount: 67,
      sellerEarningsAmount: 266,
      deliverablePublicId: 'waves/photo-1',
      deliverableType: 'PHOTO',
    });
  });

  it('uses the Paddle fixed-plus-percentage policy', () => {
    expect(snapshotOrderLine({ ...item, price: 1000 }, 'paddle')).toMatchObject({
      feePolicyVersion: 'paddle-50c-30-v1',
      platformFeeAmount: 350,
      sellerEarningsAmount: 650,
    });
  });

  it('clamps the Paddle fee to a low item price', () => {
    expect(snapshotOrderLine({ ...item, price: 50 }, 'paddle')).toMatchObject({
      platformFeeAmount: 50,
      sellerEarningsAmount: 0,
    });
  });

  it('conserves every awkward cent by subtraction', () => {
    const line = snapshotOrderLine(item, 'mock');
    expect(line.platformFeeAmount + line.sellerEarningsAmount).toBe(line.unitAmountCents);
  });
});

describe('requireOrderLineSnapshot', () => {
  const persisted = { id: 'order-item-1', ...snapshotOrderLine(item, 'mock') };

  it('returns a complete valid snapshot', () => {
    expect(requireOrderLineSnapshot(persisted)).toEqual(persisted);
  });

  it.each([
    ['partial', { sellerId: null }],
    ['unknown fee policy', { feePolicyVersion: 'future-policy' }],
    ['non-USD currency', { currency: 'EUR' }],
    ['negative amount', { platformFeeAmount: -1, sellerEarningsAmount: 334 }],
    ['non-conserving allocation', { sellerEarningsAmount: 265 }],
  ])('rejects a %s snapshot and names the order item', (_name, override) => {
    expect(() => requireOrderLineSnapshot({ ...persisted, ...override })).toThrow('order-item-1');
  });

  it.each(FEE_POLICY_VERSIONS)('round-trips a snapshot carrying fee policy %s without throwing', (feePolicyVersion) => {
    const line = { ...persisted, feePolicyVersion };
    expect(() => requireOrderLineSnapshot(line)).not.toThrow();
  });

  it('rejects a snapshot with a null deliverablePublicId — deliverable identity is as required as the money', () => {
    expect(() => requireOrderLineSnapshot({ ...persisted, deliverablePublicId: null })).toThrow('order-item-1');
  });
});
