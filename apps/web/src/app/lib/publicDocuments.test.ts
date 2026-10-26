import { describe, expect, it } from 'vitest';
import type { SurfSessionItem } from '@swelldays/contracts/core';
import { requireCanonicalSession } from './publicDocuments';

const session: SurfSessionItem = {
  id: '11111111-1111-4111-8111-111111111111', spotId: 'spot-1', photographerId: 'user-1',
  spot: { id: 'spot-1', slug: 'uluwatu', name: 'Uluwatu', location: 'Bali' },
  photographer: { id: 'user-1', name: 'Kai' },
  startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-01-01T01:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'), mediaCount: 1, thumbnailUrl: null, status: 'PUBLISHED',
};
describe('client entity consistency', () => {
  it('preserves the actual session on its canonical route', () => {
    expect(requireCanonicalSession(session, 'uluwatu')).toBe(session);
  });
  it('replaces wrong spot paths with the actual canonical destination', () => {
    try {
      requireCanonicalSession(session, 'balangan');
      throw new Error('Expected canonical redirect');
    } catch (result) {
      expect(result).toMatchObject({ options: { to: '/$spotId/session/$sessionId', params: { spotId: 'uluwatu', sessionId: session.id }, replace: true } });
    }
  });
  it('marks unavailable sessions not found rather than redirecting them to home', () => {
    try {
      requireCanonicalSession(null, 'uluwatu');
      throw new Error('Expected not found');
    } catch (result) {
      expect(result).toMatchObject({ isNotFound: true });
    }
  });
});
