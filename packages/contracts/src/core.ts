export {
  MEDIA_RESOURCE_TYPE,
  MEDIA_STATUS,
  MEDIA_UPLOAD_LIMITS,
  MIN_MEDIA_PRICE_CENTS,
} from './constants/media';
export type { MediaResourceType, MediaStatus } from './constants/media';

export { getCapturedMediaCalendarDayKey } from './capturedMediaCalendarDay';
export { RESERVED_SPOT_SLUGS, isPublicSpotSlug } from './seo/publicRoutes';
export {
  PUBLIC_ORIGIN, DEFAULT_SOCIAL_IMAGE, SELLER_EARNINGS_COPY,
  publicCanonical, publicShortDate, publicDateRange, publicBreadcrumbs,
  staticPublicDocument, spotPublicDocument, sessionPublicDocument, sessionPublicLink,
  serializePublicJsonLd,
} from './seo/publicDocument';
export type { PublicDocument, PublicDocumentLink, StaticPublicPage } from './seo/publicDocument';

export {
  ABOUT_PAGE_DESCRIPTION,
  ABOUT_PAGE_TITLE,
  GALLERY_PAGE_DESCRIPTION,
  GALLERY_PAGE_TITLE,
  HOME_PAGE_DESCRIPTION,
  HOME_PAGE_TITLE,
  sessionPageDescription,
  sessionPageTitle,
  spotGalleryDescription,
  spotGalleryTitle,
  spotPageDescription,
  spotPageTitle,
} from './seo/pageMeta';

export type { Cents, LngLat, Position } from './types/coordinates';
export type {
  DraftMedia,
  MediaCore,
  MediaType,
  PublicMedia,
  PublicMediaPage,
  PublishedMedia,
  ViewerMediaEntitlement,
  ViewerPurchaseState,
} from './types/media';
export { SPOT_STATUS } from './types/spot';
export type { Spot, SpotStatus } from './types/spot';
export { SURF_SESSION_STATUS } from './types/surfSession';
export type { SurfSessionItem, SurfSessionPage, SurfSessionStatus } from './types/surfSession';
export {
  STATUSES_BLOCKING_PUBLISH,
  STATUSES_NEEDING_RECONCILIATION,
  UPLOAD_ATTEMPT_STATUS,
  UPLOAD_SOURCE,
} from './types/upload';
export type {
  DirectUploadGrant,
  UploadAttemptProjection,
  UploadAttemptStatus,
  UploadSource,
} from './types/upload';
export type {
  UploadWorkspaceAssetProjection,
  UploadWorkspaceAssetStatus,
  UploadWorkspaceExistingMedia,
  UploadWorkspaceKind,
  UploadWorkspaceState,
  UploadWorkspaceStatus,
  UploadWorkspaceSummary,
} from './types/uploadWorkspace';
export { FIRST_VISIT_CONTENT, type FirstVisitPath } from './seo/firstVisit';
