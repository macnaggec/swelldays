import { router, protectedProcedure } from 'server/trpc';
import { uploadService } from 'server/services/UploadService';
import { uploadWorkspaceService } from 'server/services/UploadWorkspaceService';
import { createRateLimiter } from 'server/lib/rateLimiter';
import { MIN_MEDIA_PRICE_CENTS } from '@swelldays/contracts';
import { z } from 'zod';
import {
  beginLocalSchema,
  finalizeLocalSchema,
  beginDriveSchema,
  processDriveSchema,
  discardAttemptSchema,
  listAttemptsForWorkspaceSchema,
  workspaceIdSchema,
} from '@swelldays/contracts';

const beginLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const workspaceSeedSchema = z.object({
  spotId: z.string().uuid().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  photoPrice: z.number().int().min(MIN_MEDIA_PRICE_CENTS).optional(),
  videoPrice: z.number().int().min(MIN_MEDIA_PRICE_CENTS).optional(),
});

export const uploadsRouter = router({
  startNewWorkspace: protectedProcedure
    .input(workspaceSeedSchema)
    .mutation(({ input, ctx }) =>
      uploadWorkspaceService.startNewWorkspace(ctx.user!.id, input),
    ),

  startSessionEdit: protectedProcedure
    .input(z.string().uuid())
    .mutation(({ input: sessionId, ctx }) =>
      uploadWorkspaceService.startSessionEdit(ctx.user!.id, sessionId),
    ),

  getActiveWorkspace: protectedProcedure.query(({ ctx }) =>
    uploadWorkspaceService.getActiveWorkspace(ctx.user!.id),
  ),

  getWorkspaceState: protectedProcedure
    .input(workspaceIdSchema)
    .query(({ input, ctx }) =>
      uploadWorkspaceService.getWorkspaceState(ctx.user!.id, input.workspaceId),
    ),

  updateWorkspace: protectedProcedure
    .input(workspaceIdSchema.extend(workspaceSeedSchema.shape).refine(
      ({ workspaceId: _workspaceId, ...changes }) => Object.values(changes).some((value) => value !== undefined),
      'At least one workspace field is required',
    ))
    .mutation(({ input: { workspaceId, ...changes }, ctx }) =>
      uploadWorkspaceService.updateWorkspace(ctx.user!.id, workspaceId, changes),
    ),

  stageMediaRemoval: protectedProcedure
    .input(workspaceIdSchema.extend({ mediaItemId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      uploadWorkspaceService.stageMediaRemoval(ctx.user!.id, input.workspaceId, input.mediaItemId),
    ),

  unstageMediaRemoval: protectedProcedure
    .input(workspaceIdSchema.extend({ mediaItemId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      uploadWorkspaceService.unstageMediaRemoval(ctx.user!.id, input.workspaceId, input.mediaItemId),
    ),

  deleteWorkspaceAsset: protectedProcedure
    .input(workspaceIdSchema.extend({ assetId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      uploadWorkspaceService.deleteWorkspaceAsset(ctx.user!.id, input.workspaceId, input.assetId),
    ),

  saveWorkspace: protectedProcedure
    .input(workspaceIdSchema)
    .mutation(({ input, ctx }) =>
      uploadWorkspaceService.saveWorkspace(ctx.user!.id, input.workspaceId),
    ),

  cancelWorkspace: protectedProcedure
    .input(workspaceIdSchema)
    .mutation(({ input, ctx }) =>
      uploadWorkspaceService.cancelWorkspace(ctx.user!.id, input.workspaceId),
    ),

  beginLocal: protectedProcedure
    .input(beginLocalSchema)
    .mutation(({ input, ctx }) => {
      beginLimiter(ctx.user!.id);
      return uploadService.beginLocal(ctx.user!.id, input);
    }),

  finalizeLocal: protectedProcedure
    .input(finalizeLocalSchema)
    .mutation(({ input, ctx }) =>
      uploadService.finalizeLocal(ctx.user!.id, input),
    ),

  beginDrive: protectedProcedure
    .input(beginDriveSchema)
    .mutation(({ input, ctx }) => {
      beginLimiter(ctx.user!.id);
      return uploadService.beginDrive(ctx.user!.id, input);
    }),

  processDrive: protectedProcedure
    .input(processDriveSchema)
    .mutation(({ input, ctx }) =>
      uploadService.processDrive(ctx.user!.id, input),
    ),

  discard: protectedProcedure
    .input(discardAttemptSchema)
    .mutation(({ input, ctx }) =>
      uploadService.discardAttempt(ctx.user!.id, input.attemptId),
    ),

  listForWorkspace: protectedProcedure
    .input(listAttemptsForWorkspaceSchema)
    .query(({ input, ctx }) =>
      uploadService.listForWorkspace(ctx.user!.id, input.workspaceId),
    ),
});
