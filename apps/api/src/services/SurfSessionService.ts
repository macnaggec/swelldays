import {
  surfSessionRepository,
  type ISurfSessionRepository,
} from 'server/repositories/SurfSessionRepository';
import { cloudinaryService } from './CloudinaryService';
import { ForbiddenError, NotFoundError } from 'server/errors';
import { logger } from 'server/lib/logger';
import type { AssetCleanupPort } from 'server/ports/UploadAssetStorage';

export class SurfSessionService {
  constructor(
    private sessions: Pick<ISurfSessionRepository, 'findPublishedById' | 'retire'>,
    private cleanup: AssetCleanupPort,
  ) {}

  async retire(photographerId: string, sessionId: string) {
    const session = await this.sessions.findPublishedById(sessionId);
    if (!session) {
      throw new NotFoundError('Surf Session');
    }
    if (session.photographerId !== photographerId) {
      throw new ForbiddenError('You do not have permission to remove this session');
    }

    const { id, hardDeletedAssets } = await this.sessions.retire(sessionId, photographerId);

    for (const asset of hardDeletedAssets) {
      try {
        await this.cleanup.deleteStoredAsset(asset);
      } catch (err) {
        logger.error('[SurfSessionService] Cloudinary cleanup failed for retired session media', { asset, err });
      }
    }

    return { id };
  }
}

export const surfSessionService = new SurfSessionService(surfSessionRepository, cloudinaryService);
