import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  process.env.CRYPTOCLOUD_API_KEY = 'test-api-key';
  process.env.CRYPTOCLOUD_SHOP_ID = 'test-shop-id';
});

const mocks = vi.hoisted(() => ({
  updateSpot: vi.fn(),
}));

vi.mock('server/repositories/SpotRepository', () => ({
  spotRepository: {
    updateSpot: mocks.updateSpot,
  },
}));

import { appRouter } from 'server/router';

const spotId = '11111111-1111-4111-8111-111111111111';

describe('admin spots router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects signed-in non-admins', async () => {
    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'user-1', role: 'USER' } as never,
    });

    await expect(caller.admin.spots.update({
      id: spotId,
      name: 'Uluwatu',
      location: 'Bali, Indonesia',
      lat: -8.815,
      lng: 115.085,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.updateSpot).not.toHaveBeenCalled();
  });

  it('rejects signed-out callers', async () => {
    const caller = appRouter.createCaller({ session: null, user: null });

    await expect(caller.admin.spots.update({
      id: spotId,
      name: 'Uluwatu',
      location: 'Bali, Indonesia',
      lat: -8.815,
      lng: 115.085,
    })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.updateSpot).not.toHaveBeenCalled();
  });

  it('lets an admin update a spot', async () => {
    mocks.updateSpot.mockResolvedValue({
      id: spotId,
      name: 'Uluwatu',
      location: 'Bali, Indonesia',
      coords: { lat: -8.815, lng: 115.085 },
      status: 'verified',
    });

    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'admin-1', role: 'ADMIN' } as never,
    });

    await expect(caller.admin.spots.update({
      id: spotId,
      name: 'Uluwatu',
      location: 'Bali, Indonesia',
      lat: -8.815,
      lng: 115.085,
    })).resolves.toMatchObject({ id: spotId, name: 'Uluwatu' });

    expect(mocks.updateSpot).toHaveBeenCalledWith(spotId, {
      name: 'Uluwatu',
      location: 'Bali, Indonesia',
      lat: -8.815,
      lng: 115.085,
    });
  });

  it('rejects a name outside the allowed length', async () => {
    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'admin-1', role: 'ADMIN' } as never,
    });

    await expect(caller.admin.spots.update({
      id: spotId,
      name: 'A',
      location: 'Bali, Indonesia',
      lat: -8.815,
      lng: 115.085,
    })).rejects.toBeTruthy();
    expect(mocks.updateSpot).not.toHaveBeenCalled();
  });
});
