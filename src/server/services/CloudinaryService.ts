/**
 * CloudinaryService - Handles Cloudinary signature generation and configuration
 *
 * Encapsulates Cloudinary infrastructure logic to satisfy:
 * - Single Responsibility: Only handles Cloudinary operations
 * - Dependency Inversion: Server actions depend on this abstraction, not cloudinary SDK
 */

import { z } from 'zod';
import cloudinary, { generateDeliveryUrl as libGenerateDeliveryUrl, getWatermarkedPreviewTransform, MEDIA_UPLOAD_CONFIG, MEDIA_CLOUDINARY_TRANSFORMS } from 'server/providers/cloudinary';
import { InternalServerError, BadRequestError } from 'server/errors';
import type { MediaResourceType } from '@wave-atlas/contracts';
import type { DirectUploadPort, RemoteImportPort, AssetCleanupPort, UploadTarget, StoredAsset, StoredAssetIdentity, RemoteImportInput } from 'server/ports/UploadAssetStorage';
import type { DirectUploadGrant } from '@wave-atlas/contracts';

export interface CloudinarySignatureData {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  /** Delivery type — must be forwarded in upload FormData exactly as-is */
  type: 'authenticated';
  /** Eager transform string — must be forwarded in upload FormData exactly as-is */
  eager: string;
}

export interface SignedMediaAccessResult {
  downloadUrl: string; // full-resolution download with fl_attachment — signed, expires in TTL
  expiresAt: number; // Unix timestamp for downloadUrl expiry
}

export interface RemoteUploadResult {
  publicId: string;
  resourceType: MediaResourceType;
  thumbnailUrl: string;
  lightboxUrl: string;
  width: number | null;
  height: number | null;
}

function toMediaResourceType(value: string): MediaResourceType {
  if (value === 'image' || value === 'video') return value;
  throw new InternalServerError('Cloudinary returned an unsupported resource type');
}

export interface ICloudinaryService {
  generateUploadSignature(folder?: string): CloudinarySignatureData;
  uploadFromUrl(sourceUrl: string, authHeaders: Record<string, string>, folder: string, resourceType?: 'image' | 'video'): Promise<RemoteUploadResult>;
  deleteAsset(publicId: string, resourceType?: 'image' | 'video'): Promise<void>;
  generateDeliveryUrl(cloudinaryPublicId: string, transform: string, resourceType?: 'image' | 'video', format?: string): string;
  generateSignedDownload(cloudinaryPublicId: string, resourceType?: 'image' | 'video'): { downloadUrl: string; expiresAt: number };
  generatePermanentPreviewUrl(cloudinaryPublicId: string): string;
  tryGeneratePermanentPreviewUrl(cloudinaryPublicId: string): string | null;
}

const cloudinaryReceiptSchema = z.object({
  publicId: z.string().min(1),
  resourceType: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

/**
 * Service for Cloudinary upload signature generation
 * Validates configuration and creates signed upload parameters
 */
export class CloudinaryService implements ICloudinaryService, DirectUploadPort, RemoteImportPort, AssetCleanupPort {
  /**
   * Generates signed upload parameters for client-side Cloudinary uploads
   *
   * @param folder - Upload folder path (defaults to MEDIA_UPLOAD_CONFIG.FOLDER)
   * @returns Signature data needed for secure client-side upload
   * @throws InternalServerError if Cloudinary configuration is invalid
   */
  generateUploadSignature(folder: string = MEDIA_UPLOAD_CONFIG.FOLDER): CloudinarySignatureData {
    // Validate server-side secret
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      throw new InternalServerError(
        'Cloudinary misconfigured: missing CLOUDINARY_API_SECRET'
      );
    }

    // Validate public configuration
    const cloudName = process.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.VITE_CLOUDINARY_API_KEY;

    if (!cloudName || !apiKey) {
      throw new InternalServerError(
        'Cloudinary misconfigured: missing VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_API_KEY'
      );
    }

    const timestamp = Math.round(new Date().getTime() / 1000);

    // Eager transforms pre-compute two independent derived images at upload time:
    //   - thumbnail:          gallery card (small, no watermark)
    //   - lightbox_watermark: watermarked preview (medium)
    // '|' produces two separate outputs; ',' would chain them into one pipeline.
    const eager = [
      MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL,
      getWatermarkedPreviewTransform('image'),
    ].join('|');

    // All params that affect the upload MUST be signed to prevent tampering.
    const paramsToSign = {
      timestamp,
      folder,
      type: 'authenticated' as const,
      eager,
    };

    // Generate cryptographic signature
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret
    );

    return {
      signature,
      timestamp,
      cloudName,
      apiKey,
      folder,
      type: 'authenticated' as const,
      eager,
    };
  }

  // ── DirectUploadPort ────────────────────────────────────────────────────────

  createUploadGrant(target: UploadTarget, expiresAt: Date): DirectUploadGrant {
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) throw new InternalServerError('Cloudinary misconfigured: missing CLOUDINARY_API_SECRET');

    const cloudName = process.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.VITE_CLOUDINARY_API_KEY;
    if (!cloudName || !apiKey) throw new InternalServerError('Cloudinary misconfigured: missing cloud name or API key');

    const timestamp = Math.round(Date.now() / 1000);
    const publicId = target.cloudinaryPublicId;
    const resourceType = target.expectedMediaType === 'VIDEO' ? 'video' : 'image';
    const eager = [
      MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL,
      getWatermarkedPreviewTransform(resourceType),
    ].join('|');
    const type = 'authenticated' as const;

    const paramsToSign = { timestamp, public_id: publicId, eager, type };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return {
      attemptId: '',  // filled in by UploadService
      cloudinaryPublicId: publicId,
      signature,
      timestamp,
      cloudName,
      apiKey,
      type,
      eager,
      expiresAt,
    };
  }

  async verifyUploadReceipt(receipt: unknown, target: UploadTarget): Promise<StoredAsset> {
    const parsed = cloudinaryReceiptSchema.safeParse(receipt);
    if (!parsed.success) throw new BadRequestError('Invalid Cloudinary upload receipt');
    const data = parsed.data;
    if (data.publicId !== target.cloudinaryPublicId) {
      throw new BadRequestError('Upload receipt does not match the intended target');
    }
    const resourceType = toMediaResourceType(data.resourceType);
    const cloudinaryResourceType = resourceType === 'video' ? 'video' : 'image';
    return {
      cloudinaryPublicId: data.publicId,
      resourceType: resourceType === 'image' ? 'PHOTO' : 'VIDEO',
      thumbnailUrl: this.generateDeliveryUrl(data.publicId, MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL, cloudinaryResourceType, cloudinaryResourceType === 'video' ? 'jpg' : undefined),
      lightboxUrl: this.generateDeliveryUrl(data.publicId, getWatermarkedPreviewTransform(cloudinaryResourceType), cloudinaryResourceType),
      width: data.width ?? null,
      height: data.height ?? null,
    };
  }

  // ── RemoteImportPort ────────────────────────────────────────────────────────

  async importRemoteFile(input: RemoteImportInput): Promise<StoredAsset> {
    const resourceType = input.target.expectedMediaType === 'VIDEO' ? 'video' : 'image';
    const result = await this.uploadFromUrl(
      input.sourceUrl,
      input.authHeaders,
      `swelldays/users/${input.target.photographerId}`,
      resourceType,
    );
    return {
      cloudinaryPublicId: result.publicId,
      resourceType: result.resourceType === 'video' ? 'VIDEO' : 'PHOTO',
      thumbnailUrl: result.thumbnailUrl,
      lightboxUrl: result.lightboxUrl,
      width: result.width,
      height: result.height,
    };
  }

  // ── AssetCleanupPort ────────────────────────────────────────────────────────

  async deleteStoredAsset(asset: StoredAssetIdentity): Promise<void> {
    await this.deleteAsset(
      asset.cloudinaryPublicId,
      asset.resourceType === 'VIDEO' ? 'video' : 'image',
    );
  }

  /**
   * Uploads a remote file to Cloudinary by fetching it server-side with the provided auth headers.
   * Applies the same eager transforms as client-side uploads (thumbnail + watermarked lightbox).
   *
   * Note: authHeaders may contain short-lived OAuth tokens — ensure log aggregators
   * are configured to scrub Authorization headers in production.
   */
  async uploadFromUrl(
    sourceUrl: string,
    authHeaders: Record<string, string>,
    folder: string,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<RemoteUploadResult> {
    if (!process.env.CLOUDINARY_API_SECRET) {
      throw new InternalServerError('Cloudinary misconfigured: missing CLOUDINARY_API_SECRET');
    }

    const eager = [
      MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL,
      getWatermarkedPreviewTransform(resourceType),
    ].join('|');

    const result = await cloudinary.uploader.upload(sourceUrl, {
      folder,
      type: 'authenticated',
      resource_type: resourceType,
      eager,
      headers: authHeaders,
    });

    const publicId = result.public_id;

    // Generate the signed preview URLs persisted with the media record and returned by gallery reads.
    const thumbnailUrl = this.generateDeliveryUrl(publicId, MEDIA_CLOUDINARY_TRANSFORMS.THUMBNAIL, resourceType, resourceType === 'video' ? 'jpg' : undefined);
    const lightboxUrl = this.generateDeliveryUrl(publicId, getWatermarkedPreviewTransform(resourceType), resourceType);

    return {
      publicId,
      resourceType: toMediaResourceType(result.resource_type),
      thumbnailUrl,
      lightboxUrl,
      width: typeof result.width === 'number' ? result.width : null,
      height: typeof result.height === 'number' ? result.height : null,
    };
  }

  /**
   * Deletes an authenticated Cloudinary asset by public ID.
   * Used for cleanup when a DB write fails after a successful upload.
   */
  async deleteAsset(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: resourceType });
  }

  /**
   * Generates a permanent signed delivery URL for an authenticated Cloudinary asset.
   * Single owner of permanent (no-TTL) delivery URL signing — thumbnails, lightbox previews.
   * Short-lived download URLs (TTL + fl_attachment) are a separate concern handled by
   * generateSignedDownload, which calls cloudinary.url() directly with expires_at.
   */
  generateDeliveryUrl(cloudinaryPublicId: string, transform: string, resourceType: 'image' | 'video' = 'image', format?: string): string {
    return libGenerateDeliveryUrl(cloudinaryPublicId, transform, resourceType, format);
  }

  /**
   * Generates a short-lived signed download URL for a purchased media file.
   * previewUrl (clean 800px) is stored as an eager transform URL in the DB and
   * returned directly by checkout.getSignedMediaAccess — no signing needed there.
   *
   * @param cloudinaryPublicId - The public_id of the authenticated Cloudinary resource
   */
  generateSignedDownload(
    cloudinaryPublicId: string,
    resourceType: 'image' | 'video' = 'image',
  ): { downloadUrl: string; expiresAt: number } {
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      throw new InternalServerError('Cloudinary misconfigured: missing CLOUDINARY_API_SECRET');
    }

    const SIGNED_TTL = 600; // 10 minutes
    const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_TTL;

    // Full original with fl_attachment to trigger browser download.
    const downloadUrl = cloudinary.url(cloudinaryPublicId, {
      sign_url: true,
      type: 'authenticated',
      expires_at: expiresAt,
      secure: true,
      flags: 'attachment',
      resource_type: resourceType,
    });

    return { downloadUrl, expiresAt };
  }

  /**
   * Generates a permanent signed URL for the full-quality (no watermark) preview.
   * Applies t_swelldays_lightbox to the authenticated original.
   * No TTL — the signature remains valid permanently. Only generated on purchase or for the owner.
   */
  generatePermanentPreviewUrl(cloudinaryPublicId: string): string {
    if (!cloudinaryPublicId) {
      throw new InternalServerError('cloudinaryPublicId is required to generate permanent preview URL');
    }
    if (!process.env.CLOUDINARY_API_SECRET) {
      throw new InternalServerError('Cloudinary misconfigured: missing CLOUDINARY_API_SECRET');
    }

    return this.generateDeliveryUrl(cloudinaryPublicId, MEDIA_CLOUDINARY_TRANSFORMS.LIGHTBOX);
  }

  /**
   * Best-effort variant of generatePermanentPreviewUrl.
   * Returns null and logs a warning instead of throwing.
   * Use in fulfillment flows where a Cloudinary failure must not block purchase creation.
   */
  tryGeneratePermanentPreviewUrl(cloudinaryPublicId: string): string | null {
    try {
      return this.generatePermanentPreviewUrl(cloudinaryPublicId);
    } catch (err) {
      console.warn('[CloudinaryService] Failed to generate permanent preview URL — purchase will have null previewUrl', err);
      return null;
    }
  }
}

/**
 * Singleton instance - reuse across server actions
 */
export const cloudinaryService = new CloudinaryService();
