import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaService } from 'server/services/MediaService';
import type { IMediaRepository } from 'server/repositories/MediaRepository';
import { BadRequestError } from 'server/errors';
import { MEDIA_STATUS } from '@wave-atlas/contracts';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMedia = {
  findById: vi.fn(),
  updateMedia: vi.fn(),
  updateManyMedia: vi.fn(),
  softDelete: vi.fn(),
  hardDelete: vi.fn(),
  hardDeleteMany: vi.fn(),
  findDraftsBySpot: vi.fn(),
  findByIds: vi.fn(),
  findByCloudinaryPublicId: vi.fn(),
  findPublishedByPhotographer: vi.fn(),
  findPublishedBySession: vi.fn(),
  findPublishedBySpot: vi.fn(),
  findPublishedDates: vi.fn(),
};

const mockEntitlements = {
  getViewerMediaEntitlements: vi.fn(),
};

const mockCloudinary = {
  uploadFromUrl: vi.fn(),
  deleteAsset: vi.fn(),
  generateUploadSignature: vi.fn(),
};

const service = new (MediaService as unknown as new (
  media: IMediaRepository,
  cloudinary: typeof mockCloudinary,
  entitlements: typeof mockEntitlements,
) => MediaService)(mockMedia as unknown as IMediaRepository, mockCloudinary, mockEntitlements);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findPublishedByPhotographer / findPublishedBySession — delegation
// ---------------------------------------------------------------------------

describe('MediaService.findPublishedByPhotographer', () => {
  it('delegates to the repository with the given photographerId', async () => {
    const items = [{ id: 'media-1' }];
    mockMedia.findPublishedByPhotographer.mockResolvedValue(items);

    const result = await service.findPublishedByPhotographer('user-1');

    expect(mockMedia.findPublishedByPhotographer).toHaveBeenCalledWith('user-1');
    expect(result).toBe(items);
  });
});

describe('MediaService.findPublishedBySession', () => {
  it('returns public media with no purchase entitlement for anonymous viewers', async () => {
    const items = [{ id: 'media-2' }];
    mockMedia.findPublishedBySession.mockResolvedValue(items);
    mockEntitlements.getViewerMediaEntitlements.mockResolvedValue(new Map([
      ['media-2', { purchaseState: 'none' }],
    ]));

    const result = await service.findPublishedBySession('session-1');

    expect(mockMedia.findPublishedBySession).toHaveBeenCalledWith('session-1');
    expect(mockEntitlements.getViewerMediaEntitlements).toHaveBeenCalledWith(undefined, ['media-2']);
    expect(result).toEqual([
      { id: 'media-2', viewerEntitlement: { purchaseState: 'none' } },
    ]);
  });

  it('marks media already purchased by the viewer', async () => {
    mockMedia.findPublishedBySession.mockResolvedValue([
      { id: 'media-1' },
      { id: 'media-2' },
    ]);
    mockEntitlements.getViewerMediaEntitlements.mockResolvedValue(new Map([
      ['media-1', { purchaseState: 'none' }],
      ['media-2', { purchaseState: 'purchased' }],
    ]));

    const result = await (service as unknown as {
      findPublishedBySession: (
        sessionId: string,
        viewerId: string,
      ) => Promise<Array<{ id: string; viewerEntitlement: { purchaseState: string } }>>;
    }).findPublishedBySession('session-1', 'buyer-1');

    expect(mockEntitlements.getViewerMediaEntitlements).toHaveBeenCalledWith('buyer-1', ['media-1', 'media-2']);
    expect(result).toEqual([
      { id: 'media-1', viewerEntitlement: { purchaseState: 'none' } },
      { id: 'media-2', viewerEntitlement: { purchaseState: 'purchased' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// updateMedia — price guard
// ---------------------------------------------------------------------------

describe('MediaService.updateMedia — price guard', () => {
  it('throws BadRequestError when updating published media below the price floor', async () => {
    mockMedia.findById.mockResolvedValue({
      id: 'media-1',
      photographerId: 'user-1',
      status: MEDIA_STATUS.PUBLISHED,
    });

    await expect(
      service.updateMedia('user-1', 'media-1', { price: 299 })
    ).rejects.toThrow(BadRequestError);

    expect(mockMedia.updateMedia).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMedia — cleanup semantics
// ---------------------------------------------------------------------------

describe('MediaService.deleteMedia — cleanup semantics', () => {
  const unpublishedMedia = {
    id: 'media-1',
    sessionId: 'session-1',
    photographerId: 'user-1',
    cloudinaryPublicId: 'swelldays/users/user-1/photo',
    status: MEDIA_STATUS.DRAFT,
    resource: { resourceType: 'image' as const },
  };

  it('removes the DB row then attempts Cloudinary cleanup', async () => {
    mockMedia.findById.mockResolvedValue(unpublishedMedia);
    mockMedia.hardDelete.mockResolvedValue(undefined);
    mockCloudinary.deleteAsset.mockResolvedValue(undefined);

    await service.deleteMedia('user-1', 'media-1');

    expect(mockMedia.hardDelete).toHaveBeenCalledWith('media-1');
    expect(mockCloudinary.deleteAsset).toHaveBeenCalledWith('swelldays/users/user-1/photo', 'image');
  });

  it('does not propagate Cloudinary cleanup failure (best-effort)', async () => {
    mockMedia.findById.mockResolvedValue(unpublishedMedia);
    mockMedia.hardDelete.mockResolvedValue(undefined);
    mockCloudinary.deleteAsset.mockRejectedValue(new Error('provider down'));

    await expect(service.deleteMedia('user-1', 'media-1')).resolves.toBeUndefined();
  });

  it('soft-deletes published media without Cloudinary cleanup', async () => {
    mockMedia.findById.mockResolvedValue({ ...unpublishedMedia, status: MEDIA_STATUS.PUBLISHED });
    mockMedia.softDelete.mockResolvedValue(undefined);

    await service.deleteMedia('user-1', 'media-1');

    expect(mockMedia.softDelete).toHaveBeenCalledWith('media-1');
    expect(mockMedia.hardDelete).not.toHaveBeenCalled();
    expect(mockCloudinary.deleteAsset).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMediaBatch — cleanup semantics
// ---------------------------------------------------------------------------

describe('MediaService.deleteMediaBatch — cleanup semantics', () => {
  const draftItems = [
    { id: 'media-1', sessionId: 'session-1', photographerId: 'user-1', cloudinaryPublicId: 'pub-1', status: MEDIA_STATUS.DRAFT, type: 'IMAGE', price: null },
    { id: 'media-2', sessionId: 'session-1', photographerId: 'user-1', cloudinaryPublicId: 'pub-2', status: MEDIA_STATUS.DRAFT, type: 'VIDEO', price: null },
  ];

  it('removes DB rows then attempts Cloudinary cleanup for each item', async () => {
    mockMedia.findByIds.mockResolvedValue(draftItems);
    mockMedia.hardDeleteMany.mockResolvedValue(undefined);
    mockCloudinary.deleteAsset.mockResolvedValue(undefined);

    await service.deleteMediaBatch('user-1', ['media-1', 'media-2']);

    expect(mockMedia.hardDeleteMany).toHaveBeenCalledWith(['media-1', 'media-2']);
    expect(mockCloudinary.deleteAsset).toHaveBeenCalledWith('pub-1', 'image');
    expect(mockCloudinary.deleteAsset).toHaveBeenCalledWith('pub-2', 'video');
  });

  it('does not propagate Cloudinary cleanup failure for any item (best-effort)', async () => {
    mockMedia.findByIds.mockResolvedValue(draftItems);
    mockMedia.hardDeleteMany.mockResolvedValue(undefined);
    mockCloudinary.deleteAsset.mockRejectedValue(new Error('provider down'));

    await expect(service.deleteMediaBatch('user-1', ['media-1', 'media-2'])).resolves.toBeUndefined();
  });

  it('throws BadRequestError when any item is not a draft', async () => {
    mockMedia.findByIds.mockResolvedValue([{ ...draftItems[0]!, status: MEDIA_STATUS.PUBLISHED }]);

    await expect(service.deleteMediaBatch('user-1', ['media-1'])).rejects.toThrow(BadRequestError);
    expect(mockMedia.hardDeleteMany).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when items span multiple sessions', async () => {
    mockMedia.findByIds.mockResolvedValue([
      { ...draftItems[0]!, sessionId: 'session-1' },
      { ...draftItems[1]!, sessionId: 'session-2' },
    ]);

    await expect(service.deleteMediaBatch('user-1', ['media-1', 'media-2'])).rejects.toThrow(BadRequestError);
    expect(mockMedia.hardDeleteMany).not.toHaveBeenCalled();
  });
});
