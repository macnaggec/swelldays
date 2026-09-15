import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from 'server/services/UserService';
import type { IUserRepository } from 'server/repositories/UserRepository';

const mockUserRepository = {
  anonymizeAndDelete: vi.fn(),
};

const service = new UserService(
  mockUserRepository as unknown as IUserRepository,
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserService.deleteAccount', () => {
  it('delegates account deletion exactly once to the transactional repository', async () => {
    await service.deleteAccount('photographer-1');

    expect(mockUserRepository.anonymizeAndDelete).toHaveBeenCalledWith('photographer-1');
    expect(mockUserRepository.anonymizeAndDelete).toHaveBeenCalledTimes(1);
  });
});
