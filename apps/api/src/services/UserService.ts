import { userRepository, type IUserRepository } from 'server/repositories/UserRepository';

export class UserService {
  constructor(private users: IUserRepository) {}

  /**
   * Deletes the account, forfeiting any remaining balance.
   *
   * Blocked while a payout is in flight: a rejected payout refunds the balance
   * (see LedgerRepository.rejectPayout), which would resurrect money onto a row
   * nobody can sign into.
   */
  deleteAccount(userId: string): Promise<void> {
    return this.users.anonymizeAndDelete(userId);
  }
}

export const userService = new UserService(userRepository);
