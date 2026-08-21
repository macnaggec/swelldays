import { logger } from 'server/lib/logger';
import { uploadAttemptRepository } from 'server/repositories/UploadAttemptRepository';
import { cloudinaryService } from 'server/services/CloudinaryService';

export async function reconcileUploadAttempts(): Promise<void> {
  const candidates = await uploadAttemptRepository.findExpiredForReconciliation();
  logger.info('[reconciler] found candidates', { count: candidates.length });

  let cleaned = 0;
  let failed = 0;

  for (const attempt of candidates) {
    try {
      await cloudinaryService.deleteAsset(
        attempt.cloudinaryPublicId,
        attempt.expectedMediaType === 'VIDEO' ? 'video' : 'image',
      );
      await uploadAttemptRepository.markCancelled(attempt.id);
      cleaned++;
      logger.info('[reconciler] cleaned attempt', { attemptId: attempt.id });
    } catch (err) {
      failed++;
      logger.error('[reconciler] cleanup failed', { attemptId: attempt.id, err });
      // Leave in current status — next run will retry.
    }
  }

  logger.info('[reconciler] complete', { cleaned, failed });
}
