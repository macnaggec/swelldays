import { describe, expect, it } from 'vitest';
import { mapPaddleAdjustmentAction, mapPaddleAdjustmentStatus, parsePositiveMinorUnits, sellerReversalAmount } from './PaymentAdjustment';

describe('PaymentAdjustment', () => {
  it('normalizes Paddle actions and states without conflating reversals', () => {
    expect(mapPaddleAdjustmentAction('refund')).toBe('refund');
    expect(mapPaddleAdjustmentAction('chargeback')).toBe('dispute');
    expect(mapPaddleAdjustmentAction('chargeback_reverse')).toBe('dispute-reversal');
    expect(mapPaddleAdjustmentStatus('pending_approval')).toBe('pending-approval');
    expect(mapPaddleAdjustmentStatus('approved')).toBe('approved');
    expect(() => mapPaddleAdjustmentAction('mystery')).toThrow();
    expect(() => mapPaddleAdjustmentStatus('mystery')).toThrow();
  });

  it('accepts only positive safe integer minor-unit strings', () => {
    expect(parsePositiveMinorUnits('123')).toBe(123);
    for (const value of ['0', '-1', '1.2', 'NaN', '9007199254740992']) {
      expect(() => parsePositiveMinorUnits(value)).toThrow();
    }
  });

  it('uses cumulative floor rounding and reaches the exact full seller reversal', () => {
    const first = sellerReversalAmount({ originalAmountPaid: 3, originalSellerEarnings: 2,
      cumulativeAdjustedCustomerAmount: 1, alreadyDebitedSellerAmount: 0 });
    const second = sellerReversalAmount({ originalAmountPaid: 3, originalSellerEarnings: 2,
      cumulativeAdjustedCustomerAmount: 2, alreadyDebitedSellerAmount: -first });
    const final = sellerReversalAmount({ originalAmountPaid: 3, originalSellerEarnings: 2,
      cumulativeAdjustedCustomerAmount: 3, alreadyDebitedSellerAmount: -(first + second) });
    expect([first, second, final]).toEqual([0, -1, -1]);
    expect(first + second + final).toBe(-2);
  });

  it('keeps exact integer allocation near PostgreSQL integer limits', () => {
    expect(sellerReversalAmount({
      originalAmountPaid: 2_000_000_000,
      originalSellerEarnings: 1_600_000_000,
      cumulativeAdjustedCustomerAmount: 1_999_999_999,
      alreadyDebitedSellerAmount: 0,
    })).toBe(-1_599_999_999);
  });
});
