import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentAdjustmentService } from './PaymentAdjustmentService';

const repository = {
  listPending: vi.fn(), recordManual: vi.fn(), apply: vi.fn(), dismiss: vi.fn(), resolveCompensation: vi.fn(),
};
const service = new PaymentAdjustmentService(repository);

describe('PaymentAdjustmentService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds the authenticated operator to an explicit adjustment command', async () => {
    repository.apply.mockResolvedValue({ id: 'adjustment-1' });
    await service.apply({ adjustmentId: 'adjustment-1', allocations: [{ paidOrderLineId: 'line-1', amountCents: 25 }],
      revokeEntitlements: false, note: 'Buyer requested a refund' }, 'admin-1');
    expect(repository.apply).toHaveBeenCalledWith(expect.objectContaining({ operatorId: 'admin-1' }));
  });

  it('rejects blank operator notes before persistence', async () => {
    expect(() => service.dismiss('adjustment-1', '   ', 'admin-1')).toThrow('Operator note is required');
    expect(repository.dismiss).not.toHaveBeenCalled();
  });
});
