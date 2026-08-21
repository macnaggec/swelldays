import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.VITE_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;

export function generateDeliveryUrl(
  cloudinaryPublicId: string,
  transform: string,
  resourceType: 'image' | 'video' = 'image',
  format?: string,
): string {
  return cloudinary.url(cloudinaryPublicId, {
    sign_url: true,
    type: 'authenticated',
    secure: true,
    raw_transformation: transform,
    resource_type: resourceType,
    ...(format ? { format } : {}),
  });
}

export const MEDIA_UPLOAD_CONFIG = {
  FOLDER: 'swelldays/raw',
} as const;

/**
 * Cloudinary Named Transformation identifiers.
 * Define these in Cloudinary dashboard:
 * Transformations → Named Transformations → Add
 *
 * Sizing rule (both photo and video): portrait caps height at 800, landscape caps width at 1024.
 *
 *  swelldays_thumbnail                → c_fill,w_640,h_400,g_center,q_auto,f_auto
 *  swelldays_lightbox                 → if_ar_lt_1/c_limit,h_800/if_else/c_limit,w_1024/if_end/q_auto,f_auto
 *  swelldays_lightbox_watermark       → if_ar_lt_1/c_limit,h_800/if_else/c_limit,w_1024/if_end/q_auto/l_watermark_rs6dpl/c_scale,fl_relative,w_0.5,a_-45/o_30/fl_layer_apply,fl_tiled
 *  swelldays_video_lightbox_watermark → if_ar_lt_1/c_limit,h_800/if_else/c_limit,w_1024/if_end/l_overlay/fl_layer_apply
 *
 * Named transformations are always permitted through Strict Transformations.
 * Video can't use fl_tiled (image outputs only), so its watermark is a pre-tiled PNG (`overlay`)
 * applied as a single layer — otherwise handled identically to the image transform.
 */
export const MEDIA_CLOUDINARY_TRANSFORMS = {
  /** Gallery card: cropped thumbnail, no watermark */
  THUMBNAIL: 't_swelldays_thumbnail',
  /** Public image lightbox: permanent signed URL with Cloudinary's native tiled watermark */
  LIGHTBOX_WATERMARK: 't_swelldays_lightbox_watermark',
  /** Public video lightbox: pre-tiled PNG overlay (fl_tiled is image-only) */
  VIDEO_LIGHTBOX_WATERMARK: 't_swelldays_video_lightbox_watermark',
  /**
   * Full-quality lightbox: same sizing but no watermark.
   * Applied server-side only, after ownership check (purchased or own upload). Never exposed as a public URL.
   * Cloudinary dashboard: c_limit,w_800,q_auto,f_auto
   */
  LIGHTBOX: 't_swelldays_lightbox',
} as const;

export function getWatermarkedPreviewTransform(resourceType: 'image' | 'video'): string {
  return resourceType === 'video'
    ? MEDIA_CLOUDINARY_TRANSFORMS.VIDEO_LIGHTBOX_WATERMARK
    : MEDIA_CLOUDINARY_TRANSFORMS.LIGHTBOX_WATERMARK;
}
