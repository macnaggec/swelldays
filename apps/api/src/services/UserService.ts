import { userRepository, type IUserRepository } from 'server/repositories/UserRepository';
import { ledgerService, type LedgerService } from 'server/services/LedgerService';
import { BadRequestError } from 'server/errors';

export class UserService {
  constructor(
    private users: IUserRepository,
    private ledger: Pick<LedgerService, 'getSummary'>,
  ) {}

  /**
   * Deletes the account, forfeiting any remaining balance.
   *
   * Blocked while a payout is in flight: a rejected payout refunds the balance
   * (see LedgerRepository.rejectPayout), which would resurrect money onto a row
   * nobody can sign into.
   */
  async deleteAccount(userId: string): Promise<void> {
    const summary = await this.ledger.getSummary(userId);

    if (summary.pendingPayoutCents > 0) {
      throw new BadRequestError(
        'Your payout is still being processed. You can delete your account once it completes.',
      );
    }

    await this.users.anonymizeAndDelete(userId);
  }
}

export const userService = new UserService(userRepository, ledgerService);
