import { z } from 'zod';

export const beginLocalSchema = z.object({
  workspaceId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  declaredMimeType: z.string().min(1).max(100),
  declaredByteSize: z.number().int().positive(),
});

export const finalizeLocalSchema = z.object({
  attemptId: z.string().uuid(),
  providerReceipt: z.unknown(),
  capturedAt: z.coerce.date().optional(),
});

export const beginDriveSchema = z.object({
  workspaceId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  remoteFileId: z.string().min(1),
  declaredMimeType: z.string().min(1).max(100),
});

export const processDriveSchema = z.object({
  attemptId: z.string().uuid(),
  accessToken: z.string().min(1),
});

export const discardAttemptSchema = z.object({
  attemptId: z.string().uuid(),
});

export const workspaceIdSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const listAttemptsForWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
});
