import { MediaStatus, SurfSessionStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { ledgerRepository } from 'server/repositories/LedgerRepository';

export interface IUserRepository {
  anonymizeAndDelete(userId: string): Promise<void>;
}

export class UserRepository implements IUserRepository {
  anonymizeAndDelete(userId: string): Promise<void> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const deletedAt = new Date();

        // Forfeit any remaining balance through the ledger's one write path
        // (throws NotFoundError if the user does not exist)
        await ledgerRepository.forfeitBalance(tx, userId);

        // Retire published work so it stops earning into an account nobody can sign into
        await tx.mediaItem.updateMany({
          where: { photographerId: userId, deletedAt: null },
          data: { status: MediaStatus.DELETED, deletedAt },
        });
        await tx.surfSession.updateMany({
          where: { photographerId: userId, status: SurfSessionStatus.PUBLISHED },
          data: { status: SurfSessionStatus.DELETED },
        });

        // Nullify spot creator references so spots remain visible
        await tx.spot.updateMany({
          where: { creatorId: userId },
          data: { creatorId: null },
        });

        // Anonymize PII and mark as deleted (preserves purchases/transactions for audit)
        await tx.user.update({
          where: { id: userId },
          data: {
            name: 'Deleted User',
            email: `deleted_${userId}@deleted.invalid`,
            image: null,
            password: null,
            deletedAt,
          },
        });

        // Hard-delete auth records so the account cannot be used to log in
        await tx.session.deleteMany({ where: { userId } });
        await tx.account.deleteMany({ where: { userId } });
      })
    );
  }
}

export const userRepository = new UserRepository();
