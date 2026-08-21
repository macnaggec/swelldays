import {
  surfSessionRepository,
  type ISurfSessionRepository,
} from 'server/repositories/SurfSessionRepository';
import { ForbiddenError, NotFoundError } from 'server/errors';

export class SurfSessionService {
  constructor(
    private sessions: Pick<ISurfSessionRepository, 'findPublishedById' | 'retire'>,
  ) {}

  async retire(photographerId: string, sessionId: string) {
    const session = await this.sessions.findPublishedById(sessionId);
    if (!session) {
      throw new NotFoundError('Surf Session');
    }
    if (session.photographerId !== photographerId) {
      throw new ForbiddenError('You do not have permission to remove this session');
    }

    return this.sessions.retire(sessionId, photographerId);
  }
}

export const surfSessionService = new SurfSessionService(surfSessionRepository);
